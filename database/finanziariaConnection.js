require("dotenv").config();
const logger = require("../logger")

async function getDatiFinanziaria(prezzo, pv, finanziaria) {
    try {
        let now = new Date()


        let finData = { nrate: 0, rata: 0, tan: 0, taeg: 0, proroga: "0", spese: 0 }

        if (prezzo < 1000 && pv === 'LC') {
            finanziaria = 'Tan 0 Taeg 0'
        }
        else {
            finanziaria = 'Tan 0 Taeg Variabile'
        }

        if (now > new Date('2023-08-23')) finanziaria = 'Tan 0 Taeg 0'

        if (pv === 'PR') finanziaria = 'Rata chiara'

        //  console.log(finanziaria)

        //finanziaria tan e taeg zero
        if (finanziaria === 'Tan 0 Taeg 0') {
            finData.tan = 0
            finData.taeg = 0
            finData.proroga = ""
            if (prezzo > 398 && prezzo < 1000) {
                finData.nrate = 10
                finData.rata = prezzo / finData.nrate
            } else
                if (prezzo >= 1000 && prezzo < 5000) {
                    finData.nrate = 10
                    finData.rata = prezzo / finData.nrate
                }
                else {
                    finData.error = "Importo da finanziare fuori range"
                }
        } else {

            //finanziaria tan 0
            if (finanziaria === 'Tan 0 Taeg Variabile') {
                finData.tan = 0
                finData.proroga = "Gennaio 2024"

                if (prezzo > 298.99 && prezzo <= 1499.99) {
                    finData.nrate = 20
                    finData.taeg = 11.58
                    finData.spese = ((prezzo * 0.7) / 100) * finData.nrate
                    finData.rata = (finData.spese + prezzo) / finData.nrate
                } else
                    if (prezzo >= 1500 && prezzo <= 2499.99) {
                        finData.nrate = 26
                        finData.taeg = 12.35
                        finData.spese = ((prezzo * 0.7) / 100) * finData.nrate
                        finData.rata = (finData.spese + prezzo) / finData.nrate
                    } else
                        if (prezzo >= 2500 && prezzo <= 5000.99) {
                            finData.nrate = 32
                            finData.taeg = 12.84
                            finData.spese = ((prezzo * 0.7) / 100) * finData.nrate
                            finData.rata = (finData.spese + prezzo) / finData.nrate
                        } else { finData.error = "Importo da finanziare fuori range" }

            } else {
                if (finanziaria === 'Rata chiara') {
                    finData.proroga = "dopo 3 mesi"
                    if (prezzo < 999.99) {
                        finData.nrate = 22
                        finData.taeg = 11.12
                        finData.tan = 10.60
                        finData.spese = prezzo * 0.0011
                        finData.rata = (prezzo / (finData.nrate - 2)) + finData.spese
                    } else {
                        finData.nrate = 33
                        finData.taeg = 9.39
                        finData.tan = 9.00
                        finData.spese = prezzo * 0.00152
                        finData.rata = (prezzo / (finData.nrate - 3)) + finData.spese
                    }
                }
                else {
                    finData.error = "Finanziaria non trovata"
                }

            }
        }

        if (!finData.error) {
            finData.rata = finData.rata.toFixed(2)
            finData.spese = finData.spese.toFixed(2)
            finData.tan = finData.tan.toFixed(2)
            finData.taeg = finData.taeg.toFixed(2)
        }
        console.log(finData)
        return finData
    } catch (err) {
        logger.error("ERRORE: " + err)
        return err;
    }
}

module.exports = {
    getDatiFinanziaria: getDatiFinanziaria,
}