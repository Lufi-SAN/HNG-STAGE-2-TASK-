import express, { type NextFunction, type Request, type Response } from 'express';
import dotenv from 'dotenv';
dotenv.config();
import statusRouter from './routes/status.js';
import countriesRouter from './routes/countries.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/status', statusRouter);
app.use('/countries', countriesRouter);

app.get('/', (req : Request, res : Response) => {
    res.send('Hello, World!');
});

app.use((req, res, next) => {
    res.status(404).send('Page not exist')
})

app.use((err : Error, req : Request, res : Response, next : NextFunction) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});