import { Router } from "express";
import queries from "../db/queries.js";
const statusRouter = Router();

statusRouter.get("/", async (req, res) => { 
    try {
        const statusObject = await queries.getCountries({
            allOnly: false,
            oneOnly: false,
            statusOnly: true
        })
        res.status(200).json(statusObject)
    }
    catch (err){
        res.status(500).json({ "error": "Internal server error" })
    }
});

export default statusRouter;