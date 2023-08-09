//recupero variabili di ambiente
require("dotenv").config();
const tokenKey = process.env.TOKEN_KEY
const BINDUSER = process.env.BINDUSER
const BINDUSERPW = process.env.BINDUSERPW
const mongoDbUrl = process.env.MONGODBURL
const serviceWSIPass = process.env.SERVICEPASS
const serviceWSIUser = process.env.SERVICEUSER
const WSIURL = process.env.WSIURL
const { MongoClient } = require('mongodb')
const jwt = require('jsonwebtoken');
const axios = require('axios')
const mongoClient = new MongoClient(mongoDbUrl)
const { authenticate } = require('ldap-authentication')
const { findByUsername, updateLastLogin, createUser, findById } = require('./database/utentiConnection')
const { logger } = require('./logger')

const pvNord = ["VM", "VI", "PD", "VR", "TV", "MN", "UD", "U2", "MV"]

const MV = {
    indirizzo: "VIA DELLA RIC.SCIENTIFICA N.9 ",
    comune: "PADOVA",
    provincia: "PD",
    cap: "35127"
}

const TA = {
    indirizzo: "C.DA TORRE ALLEGRA XVI STRADA",
    comune: "CATANIA",
    provincia: "CT",
    cap: "95121"
}

const getNomeDaSigla = async (sigla) => {
    let wsi = await generaTokenWSI(serviceWSIUser, serviceWSIPass)
    let resp = await axios({
        method: 'get', url: WSIURL + '/puntivendita/nomedasigla?pv=' + sigla,
        headers: {
            Authorization: `Bearer ${wsi.data.token}`,
        },
    }).catch((err) => {
        console.log(err)
        logger.error("ERRORE: " + err)
        return ({ error: "errore recupero collegamento con WSI" })
    })

    return resp.data
}

const syncUtente = async (utente) => {
    await mongoClient.connect();
    let utenteWSI = await findByUsername(mongoClient, utente.username)
    if (utenteWSI) {
        let res = await updateLastLogin(mongoClient, utente)
    }
    else {
        let res2 = await createUser(mongoClient, utente)
    }
}

function trovaPrimoNonUndefined(array) {
    for (let elemento of array) {
        if (elemento !== undefined) {
            return elemento;
        }
    }
    return undefined; // Restituisce undefined se nessun elemento non definito viene trovato
}

const getPV = async (groups) => {
    let find = groups.map(e => {
        if (e.includes("Area_Vendita")) return e.substring(13, 15)
        if (e.includes("Area_Logistica")) return e.substring(15, 17)
        if (e.includes("Area_Direzione")) return e.substring(15, 17)
        if (e.includes("Area_Finanziaria")) return e.substring(17, 19)
        if (e.includes("Area_Informatica")) return e.substring(17, 19)
        if (e.includes("Area_Marketing")) return e.substring(15, 17)
        if (e.includes("Area_Amministrativa")) return e.substring(20, 22)
    })

    let pv = trovaPrimoNonUndefined(find)
    // console.log(pv)
    if (pv) {
        //console.log(find)
        let trovato = pv
        let pvname = ""
        if (pv === "TA") {//aggiustamento per sede torre allegra
            pvname = "Torre Allegra"
            trovato = "PR"
        }
        else {
            pvname = await getNomeDaSigla(trovato)
            console.log(pvname)
        }

        return { sigla: trovato, nome: pvname }
    }
    else return false
}

const onPvGroup = (groups) => {
    let find = groups.find(e => {
        if (e.includes("Area_Vendita")) return "Area_Vendita"
        if (e.includes("Area_Logistica")) return "Area_Logistica"
        if (e.includes("Area_Direzione")) return "Area_Direzione"
        if (e.includes("Area_Finanziaria")) return "Area_Finanziaria"
        else return false
    })
    if (find) return find.slice(0, -3)
    else false
}

const getRole = (groups) => {
    let pvgr = onPvGroup(groups)
    if (pvgr) {
        if (pvgr === "Area_Vendita" || pvgr === "Area_Finanziaria") return "rc"
        if (pvgr === "Area_Direzione") return "storeManager"
        if (pvgr === "Area_Logistica") return "mag"
        if (pvgr === "Area_Logistica_MV") return "mag"
    } else {
        if (groups.includes('SpedizioniEC Admin')) return "adminSpedizioni"
        else if (groups[0]) return groups[0]
    } return false
}

const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1]
        jwt.verify(token, tokenKey, (err, user) => {
            if (err) {
                res.status(403).json({ "error": 'token non valido' });
            } else {
                user.token = token
                req.user = user;
                next();
            }
        });
    } else {
        res.status(401).json({ "error": 'token assente' });
    }
};

// verifica role ADMIN o TL
const isAdmin = (req, res, next) => {
    const currRole = req.user.role
    if (currRole === "admin" || currRole === "tl") {
        next()
    } else {
        res.status(401).json({ "error": 'non hai i permessi necessari' });
    }
};

const generaTokenWSI = async (user, pass) => {
    return await axios({
        method: 'post',
        url: WSIURL + '/ldapLogin',

        data: {
            username: user,
            password: pass
        }
    }).catch((err) => {
        console.log(err)
        logger.error("ERRORE: " + err)
    })
}

const ldapAuthentication = async (username, password) => {
    let options = {
        ldapOpts: {
            url: 'ldap://192.168.203.212',
        },
        adminDn: BINDUSER,
        adminPassword: BINDUSERPW,
        userPassword: password,
        userSearchBase: 'dc=bruno,dc=local',
        usernameAttribute: 'sAMAccountName',
        username: username,
        attributes: ['dn', 'sn', 'cn', 'memberOf', 'description', 'telephoneNumber']
    }

    let user = await authenticate(options).catch(err => {
        console.log(err)
        return false
    })
    return user
}

module.exports = {
    isAdmin: isAdmin,
    authenticateJWT: authenticateJWT,
    generaTokenWSI: generaTokenWSI,
    ldapAuthentication: ldapAuthentication,
    getRole: getRole,
    getPV: getPV,
    MV: MV,
    TA: TA,
    pvNord: pvNord,
    syncUtente: syncUtente
}