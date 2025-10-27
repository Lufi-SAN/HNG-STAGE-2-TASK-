import database from './pool.js'
import dotenv from 'dotenv';
dotenv.config();
import { type Country, type Currency, type ExchangeRateApiResponse, type Rates } from '../types/custom.js';
import generateImage from '../image/generateSummaryImage.js';
import path from 'path';
import fs from 'fs';

async function fetchCountryData() {
    try {
        const fetchResponse = await fetch(process.env.COUNTRY_DATA_URL as string)
        if (!fetchResponse.ok) {
            console.log('[fetchCountryData call in queries.ts]Fetch okay, server error')
            throw new Error('503: restcountries.com')
        }
        const arrayOfCountryObjects : Country[] = await fetchResponse.json()
        return arrayOfCountryObjects
    } catch (err : unknown) {
        if (err instanceof Error) {
            console.log('[fetchCountryData call in queries.ts]Fetch horribly wrong')
            throw new Error('500')
        }
    }
}

async function fetchExchangeRateObject() {
    try {
        const fetchResponse = await fetch(process.env.EXCHANGE_RATE_URL as string)
        if (!fetchResponse.ok) {
            console.log('[fetchExchangeRate call in queries.ts]Fetch okay, server error') 
            throw new Error('503: open.er-api.com')
        }
        const exchangeRateResponseObject : ExchangeRateApiResponse = await fetchResponse.json()
        return exchangeRateResponseObject.rates
    } catch (err : unknown) {
        if (err instanceof Error) {
            console.log('[fetchExchangeRate call in queries.ts]Fetch horribly wrong')
            throw new Error('500')            
        }
    }
}

async function postRefresh() {
    try {
    //postRefresh does not return anything rn, just actions*
    //ON post, country.currencies === SOT, so 1st API always called; 
    // 1. If c.c[0]: call 2nd API, get 1 field & calculate gdp
    // 2. If !c.c[0]: don't call 2nd API, make up field names for currency_code, 2nd API field & gdp
    // 1b. If c.c[0] but 2nd API does not have code, make up field names for 2nd API field & gdp
    const arrayOfCountryObjects = await fetchCountryData()
    if (arrayOfCountryObjects) {
        for(let countryObject of arrayOfCountryObjects) {
            if (countryObject.currencies && countryObject.currencies[0]) {//1. If c.c[0]
                //Get fields from first API
                const { name , capital, region, population, flag } = countryObject
                const flag_url = flag
                const currency_code = countryObject.currencies[0].code

                if (!population) {
                    console.warn('[Validation Error] No name or population')
                    continue;
                }
                //call 2nd API
                const exchangeRateMapping = await fetchExchangeRateObject()
                if (exchangeRateMapping) {
                    if (exchangeRateMapping.hasOwnProperty(currency_code)) {// 1b(happy path). If 2nd API has currency_code 
                        const randomNumber = Math.floor(Math.random() * 1001 ) + 1000
                        const exchange_rate = exchangeRateMapping[currency_code]
                        const estimated_gdp = (population as number * randomNumber)
                        database.query(`INSERT INTO countries 
                            (name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url) 
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                            [name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url])
                            
                        try {
                        const result = await database.query("SELECT name, gdp FROM countries ORDER BY gdp DESC");
                        const countries = result.rows
                        const total = countries.length
                        const top5 = countries.slice(0, 5)
                        const timestamp = countries[0]?.last_refreshed_at
                        generateImage(total, top5, timestamp) 
                        } catch (err) {
                            throw new Error('500')
                        }
                    } else {// 1b(sad path) If 2nd API does not have code
                        const exchange_rate = null
                        const estimated_gdp = null
                        database.query(`INSERT INTO countries 
                            (name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url) 
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                            [name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url])
                    }
                }
                
            } else if (countryObject.currencies && !countryObject.currencies[0]) {// 2. If !c.c[0]
                const { name , capital, region, population, flag } = countryObject
                const flag_url = flag
                const currency_code = null
                const exchange_rate = null
                const estimated_gdp = 0
                database.query(`INSERT INTO countries 
                            (name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url) 
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                            [name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url])
            }
        }
}} catch (err) {
    if (err instanceof Error) {
            console.log('[Query Error] In POST query function')
            throw new Error('500')
        }
}
}

type getCountriesParam = {
    allOnly : boolean,
    statusOnly: boolean, 
    oneOnly : boolean,
    allOnlyQuery? : MyQuery,
    oneCountryName? : string
}

type MyQuery = {
    region? : string,
    currency? : string,
    sort? : string
}

//I have one function for three types of GETS 1. All countries (with filtering) 2. One country specified by user 3. status
//i pass an object three props determie type of GET
//allOnly gets all countries(pass possible req.query object as allOnlyQuery)
//oneOnly gets one country (pass necessary (but possible in param object) name as oneCountryName)
//statusOnly gets status

async function getCountries(param : getCountriesParam) {
    try {
    if (param.allOnly && !param.statusOnly && !param.oneOnly) {//For GET /countries (which has queries)
        const values = []
        const whereClauses : string[] = []
        let orderClause = ''
        if (param.allOnlyQuery?.region !== undefined) {
            values.push(param.allOnlyQuery.region)
            whereClauses.push(`region = $${values.length}`)
        }

        if (param.allOnlyQuery?.currency !== undefined) {
            values.push(param.allOnlyQuery.currency)
            whereClauses.push(`currency = $${values.length}`)
        }

        if (param.allOnlyQuery?.sort !== undefined) {
            const toUpper = param.allOnlyQuery.sort.toUpperCase()
            if (toUpper === 'ASC' || toUpper === 'DESC') {
                orderClause = `ORDER BY gdp $${values.length}`
            }
        }
        let queryText = `SELECT * FROM countries`
        if (whereClauses.length > 0) {
            queryText += ' WHERE ' + whereClauses.join(' AND ');
        }
        queryText += orderClause

        const {rows} = await database.query(queryText, values)
        return rows 
    } 

    else if (!param.allOnly && !param.statusOnly && param.oneOnly) {//For GET countries/name
        if (param.oneCountryName) {
            const {rows} = await database.query('SELECT * FROM countries WHERE name = $1', [param.oneCountryName])
            return rows
        }
    }

    else if (!param.allOnly && param.statusOnly && !param.oneOnly) {//For GET /status
        const {rows} = await database.query('SELECT COUNT(*) AS total_countries, MAX(last_refreshed_at) AS last_refreshed_at FROM countries')
        return {rows}
    }
    } catch (err) {
        if (err instanceof Error) {
            console.log('[Query Error] In GET query function')
            throw new Error('500')
        }
    }
}

async function deleteCountry(country : string) {
    try {
    await database.query('DELETE FROM countries WHERE name = $1', [country])
    } catch(err) {
        if (err instanceof Error) {
            console.log('[Query Error] In DELETE query function')
            throw new Error('500')
        }
    }
}

function getImage() {
    const imgPath = path.join(process.cwd(), "summary.png");
    if (!fs.existsSync(imgPath)) {
        throw new Error('404')
    }
    return imgPath
}

const queries = {
    postRefresh,
    getCountries,
    deleteCountry,
    getImage
}
export default queries