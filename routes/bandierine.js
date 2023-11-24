require("dotenv").config();
const mongoDbUrl = process.env.MONGODBURL
const MODE = process.env.MODE
const fs = require('fs');
const puppeteer = require('puppeteer')

const qrcode = require('qrcode');
const bwipjs = require('bwip-js')
const handlebars = require('handlebars');
const { PDFDocument } = require('pdf-lib');
let express = require('express');
let router = express.Router();
const logger = require('../logger');
const { MongoClient, ConnectionCheckOutStartedEvent } = require('mongodb')
const cron = require('node-cron');
const sharp = require("sharp");
const { getVariazioni, getCodiciVariazioni, getDatiEtichette } = require('../asFunction')
const { getDatiFinanziariaDinamic } = require('../database/finanziariaConnection')

const articoliTest5 = ['15-EG2007NL']

const articoliTest3 = ['GOLDENSTAR', '15-EG2007NL', 'UE32T5372CU']
const mongoClient = new MongoClient(mongoDbUrl)


function generateBarcode(options) {
    return new Promise((resolve, reject) => {
        bwipjs.toBuffer(options, function (err, png) {
            if (err) {
                reject(err);
            } else {
                resolve(png);
            }
        });
    });
}


function mergeCARFields(data) {
    let mergedString = "";
    for (const key in data) {
        if (key.startsWith("CAR")) {
            const fieldValue = data[key].trim();
            if (fieldValue !== "") {
                mergedString += fieldValue + " • ";
            }
        }
    }
    // Rimuovi l'ultimo carattere "•" e gli spazi bianchi finali
    mergedString = mergedString.trim().slice(0, -1);
    return mergedString;
}

router.get('/', async (req, res, next) => {
    try {
        const dettagliArticoli = await getDatiEtichette(articoliTest3)
        const A4_MARGIN = 5
        const A4_WIDTH = 297  // dimesioni in mm del foglio A4 orizzontale
        const A4_HEIGHT = 210
        const EL_WIDTH = 65  // dimesioni in mm del singolo prezzo
        const EL_HEIGHT = 60
        let nElementi = dettagliArticoli.length
        let nElementiRigaMax = Math.floor((A4_WIDTH - A4_MARGIN) / EL_WIDTH)
        let nElementiColonnaMax = Math.floor((A4_HEIGHT - A4_MARGIN) / EL_HEIGHT)

        let righe = Math.floor(nElementi / nElementiRigaMax)
        let colonne = Math.ceil(nElementi / righe)

        let elPerPag = nElementiRigaMax * nElementiRigaMax
        let nPagine = Math.ceil(nElementi / elPerPag)

        console.log(`elementiRigaMax ${nElementiRigaMax} - elementiColonnaMax ${nElementiColonnaMax} - elementi ${nElementi} - righe: ${righe} - colonne ${colonne} - elementi per pagina ${elPerPag} - numero pagine ${nPagine}`)

        //console.log(dettagliArticoli);
        const browser = await puppeteer.launch({ args: ['--no-sandbox'], headless: true });

        let pagine = []

        let elemento = 0
        for (let page = 0; page < nPagine; page++) {
            //  console.log(`Start pagina ------------------------------------ ${page}`)
            let articoli = []
            for (let e = 0; e < elPerPag && elemento < nElementi; e++) {
                //console.log(`${dettagliArticoli[elemento].CODICE} in pagina ${page}`)
                articoli.push(dettagliArticoli[elemento])
                elemento++
            }
            pagine.push({ pag: page, articoli: articoli })
            // console.log(`End   pagina ------------------------------------ ${page}`)
        }



        const page = await browser.newPage();

        // Caricamento del file Handlebars
        const handlebarsTemplate = fs.readFileSync('./templates/default/C8.handlebars', 'utf8');
        const compiledTemplate = handlebars.compile(handlebarsTemplate);

        const mergedPdf = await PDFDocument.create();

        let jsontohandle = { pageType: 'A4 landscape', pagine: pagine }
        //console.log(JSON.stringify(jsontohandle, null, 2))
        //  for (const articolo of dettagliArticoli) {
        // Generazione del contenuto HTML dinamico per ogni articolo
        const htmlContent = compiledTemplate(jsontohandle);

        //console.log(htmlContent)

        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
        await page.waitForNetworkIdle()
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, color: true });

        // Caricamento del PDF generato per l'articolo corrente
        const pdf = await PDFDocument.load(pdfBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => {
            mergedPdf.addPage(page);
        });
        //  }

        // Salvataggio del PDF combinato
        const mergedPdfBytes = await pdf.save();
        fs.writeFileSync('./pdf/merged.pdf', mergedPdfBytes);
        //    res.download('./pdf/merged.pdf')
        res.send(htmlContent)

        await browser.close();
    } catch (error) {
        console.log(error);
    }

})

var callback = function (pdf) {
    // do something with the PDF like send it as the response
    res.setHeader("Content-Type", "application/pdf");
    res.send(pdf);
}

router.get('/stampa', async function (req, res, next) {
    try {

        const grafica = req.body.grafica
        const formato = req.body.formato
        const scenario = req.body.scenario
        const articoli = req.body.articoli
        const pv = req.body.pv
        const user = req.user
        console.log(user)

        // ottieni i link ai file utili
        const handlebarsTemplate = fs.readFileSync(`./templates/${grafica}/${formato}/${scenario}/template.handlebars`, 'utf8');
        const base64back = fs.readFileSync(`./templates/${grafica}/${formato}/${scenario}/sfondo.png`, { encoding: 'base64' });
        const base64star = fs.readFileSync(`./templates/${grafica}/${formato}/${scenario}/euStar.png`, { encoding: 'base64' });

        // ottieni le info dei prodotti
        const dettagliArticoli = await getDatiEtichette(pv, articoli)

        // avvio e creazione pagine con Puppeteer
        const browser = await puppeteer.launch({ args: ['--no-sandbox', '--font-render-hinting=none'], headless: "new" });
        const page = await browser.newPage();
        // Caricamento del file Handlebars e creazione documento PDF
        const compiledTemplate = handlebars.compile(handlebarsTemplate);

        const mergedPdf = await PDFDocument.create();

        for (const articolo of dettagliArticoli) {

            /////**** Generazione del contenuto HTML dinamico per ogni articolo *********/////

            articolo.STELLE = Math.floor(articolo.PREZZO)
            articolo.PREZZOINT = Math.floor(articolo.PREZZO).toString()
            articolo.PREZZODEC = articolo.PREZZO.toFixed(2).split('.')[1]
            articolo.BACKGROUNDURL = `data:image/png;base64,${base64back}`
            articolo.STARIMG = `data:image/png;base64,${base64star}`

            // genero i dati finanziari
            articolo.datiFin = await getDatiFinanziariaDinamic(articolo.PREZZO, pv)
            let rata = parseFloat(articolo.datiFin.rata)
            articolo.datiFin.rataInt = Math.floor(rata).toString()
            articolo.datiFin.rataDec = rata.toFixed(2).split('.')[1]
            //generazione QRCODE con link ecat
            const qrCodeBuffer = await qrcode.toBuffer(articolo.ECATLINK);
            const qrCodeBase64 = qrCodeBuffer.toString('base64');
            articolo.QRCODE = `data:image/png;base64,${qrCodeBase64}`

            // Genera il codice a barre utilizzando bwip-js
            const barcodeOptions = {
                bcid: 'code128', // Tipo di codice a barre da generare (in questo caso, Code 128)
                text: articolo.BARCODE.toString(), // Dati da codificare nel codice a barre
                scale: 3, // Scala del codice a barre
                height: 10, // Altezza del codice a barre
                includetext: true, // Includi il testo nel codice a barre
                textxalign: 'center', // Allinea il testo al centro
                textsize: 13 // Dimensione del testo
            };
            const png = await generateBarcode(barcodeOptions)
            const barcodeBase64 = Buffer.from(png).toString('base64')
            articolo.BARCODEIMG = `data:image/png;base64,${barcodeBase64}`

            // genero le caratteristiche unendo tutti i campi CAR
            let caratteristiche = mergeCARFields(articolo)
            articolo.CARATTERISTICHE = caratteristiche ? caratteristiche : articolo.DESCRIZIONE

            // compilo il template con i dati e lo imposto come contenuto della pagina
            const htmlContent = compiledTemplate(articolo);
            console.log(JSON.stringify(articolo))
            // res.send(htmlContent)
            await page.setContent(htmlContent, { waitUntil: 'networkidle2' });

            // attendo tutte le connessioni di rete che recuperano i dati dell'html e genero la pagina pdf
            //await page.waitForNetworkIdle()

            // creo il PDF dalla pagine Puppeteer
            const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, color: true });

            // Caricp PDF generato per l'articolo corrente e aggiungo la pagina del pdf da restituire
            const pdf = await PDFDocument.load(pdfBuffer);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach((page) => {
                mergedPdf.addPage(page);
            });
        }

        // Salvataggio e invio del PDF combinato
        const mergedPdfBytes = await mergedPdf.save();
        const filename = `./pdf/${formato}-${grafica}-${scenario}.pdf`
        fs.writeFileSync(filename, mergedPdfBytes);
        res.download(filename)
        await browser.close();
        fs.unlinkSync(filename)
    } catch (error) {
        console.log(error);
    }
});


module.exports = router;