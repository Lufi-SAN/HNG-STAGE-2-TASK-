import * as dotenv from 'dotenv';
dotenv.config();
import { Client } from 'pg';

const SQL = `
CREATE TABLE IF NOT EXISTS strings (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY NOT NULL,
  string TEXT UNIQUE,
  palindrome BOOLEAN,
  length INTEGER,
  word_count INTEGER
);

CREATE TABLE IF NOT EXISTS countries (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    capital TEXT,
    region TEXT,
    population BIGINT,
    currency_code TEXT,
    exchange_rate NUMERIC(15,6),
    estimated_gdp NUMERIC(20,2),
    flag_url TEXT,
    last_refreshed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


`

async function main() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    })
    await client.connect()
    await client.query(SQL)
    await client.end()
}

main()
