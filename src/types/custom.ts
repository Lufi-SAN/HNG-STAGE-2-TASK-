export type Currency = {
    code: string;
    name: string;
    symbol: string;
};

export type Country = {
    name: string;
    capital?: string;
    region?: string;
    population?: number;
    flag?: string;
    currencies?: Currency[];
    independent?: boolean;
};

export type Rates = {
    [currencyCode: string]: number;
};


export type ExchangeRateApiResponse = {
    result: string;
    provider: string;
    documentation: string;
    terms_of_use: string;
    time_last_update_unix: number;
    time_last_update_utc: string;
    time_next_update_unix: number;
    time_next_update_utc: string;
    time_eol_unix: number;
    base_code: string;
    rates: Rates;
};