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
    
    const arrayOfCountryObjects = await fetchCountryData();
    if (!arrayOfCountryObjects) return;

    // Fetch the exchange rate object ONCE
    const exchangeRateMapping = await fetchExchangeRateObject();
    if (!exchangeRateMapping) throw new Error("Exchange rate fetch failed");

    // (Optional) Clear old data if you want a fresh set every run
    await database.query("TRUNCATE TABLE countries RESTART IDENTITY;");

    // Build an array of promises for concurrent inserts
    const insertPromises = arrayOfCountryObjects.map(async (countryObject) => {
      const { name, capital, region, population, flag } = countryObject;
      const flag_url = flag;

      // Validation
      if (!name || !population) {
        console.warn(`[Validation Error] Missing name or population for ${name}`);
        return;
      }

      // Case 1: Country has currencies
      if (countryObject.currencies && countryObject.currencies[0]) {
        const currency_code = countryObject.currencies[0].code;

        if (exchangeRateMapping.hasOwnProperty(currency_code)) {
          // Happy path: valid currency in 2nd API
          const randomNumber = Math.floor(Math.random() * 1001) + 1000;
          const exchange_rate = exchangeRateMapping[currency_code];
          const estimated_gdp = population * randomNumber;

          await database.query(
            `INSERT INTO countries 
              (name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url) 
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url]
          );
        } else {
          // Sad path: 2nd API does not have code
          await database.query(
            `INSERT INTO countries 
              (name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url) 
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [name, capital, region, population, currency_code, null, null, flag_url]
          );
        }
      } 
      // Case 2: Country has no currency array or empty array
      else {
        await database.query(
          `INSERT INTO countries 
            (name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [name, capital, region, population, null, null, 0, flag_url]
        );
      }
    });

    // Run all inserts concurrently
    await Promise.all(insertPromises);

    // Optional: generate summary image
    const result = await database.query(
      `SELECT name, gdp, last_refreshed_at FROM countries ORDER BY gdp DESC`
    );
    const countries = result.rows;
    const total = countries.length;
    const top5 = countries.slice(0, 5);
    const timestamp = countries[0]?.last_refreshed_at;
    generateImage(total, top5, timestamp);
} catch (err) {
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
                orderClause = `ORDER BY gdp $${toUpper}`
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
            if (rows.length === 0) {
                throw new Error('404')
            }
            return rows[0]
        }
    }

    else if (!param.allOnly && param.statusOnly && !param.oneOnly) {//For GET /status
        const {rows} = await database.query(`SELECT COUNT(*) AS total_countries, MAX(last_refreshed_at) AS last_refreshed_at FROM countries`)
        return rows[0]
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
    const result = await database.query(`DELETE FROM countries WHERE name = $1`, [country])
    return result
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