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
    console.log("Fetching country and exchange data...");
    const arrayOfCountryObjects = await fetchCountryData();
    const exchangeRateMapping = await fetchExchangeRateObject();

    if (!arrayOfCountryObjects || !exchangeRateMapping) {
      throw new Error("Failed to fetch required data");
    }

    // Optional: clear table first if you’re repopulating
    await database.query("TRUNCATE TABLE countries RESTART IDENTITY;");

    // Build an array of promises
    const insertPromises = arrayOfCountryObjects.map((country) => {
      const { name, capital, region, population, flag, currencies } = country;
      const flag_url = flag;
      const currency_code = currencies?.[0]?.code || null;

      if (!name || !population) {
        console.warn(`[Validation Error] Skipping invalid record for ${name}`);
        return Promise.resolve(); // skip invalid rows
      }

      let exchange_rate: number | null = null;
      let estimated_gdp: number | null = null;

      if (currency_code && exchangeRateMapping.hasOwnProperty(currency_code)) {
        const randomNumber = Math.floor(Math.random() * 1001) + 1000;
        exchange_rate = exchangeRateMapping[currency_code]
        estimated_gdp = population * randomNumber
      } else {
        exchange_rate = null;
        estimated_gdp = 0;
      }

      return database.query(
        `INSERT INTO countries 
          (name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url]
      );
    });

    // Wait for all inserts to finish
    await Promise.all(insertPromises);

    // Generate image after DB population
    const result = await database.query(
      `SELECT name, estimated_gdp AS gdp, last_refreshed_at FROM countries ORDER BY gdp DESC`
    );
    const countries = result.rows;
    const total = countries.length;
    const top5 = countries.slice(0, 5);
    const timestamp = countries[0]?.last_refreshed_at;

    await generateImage(total, top5, timestamp);

    console.log("Database refresh and image generation complete ✅");
    return "done";
  } catch (err) {
    console.error("[postRefresh error]", err);
    throw err; // Let the router catch it
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