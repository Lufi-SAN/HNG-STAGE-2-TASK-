import { Router } from "express";
import queries from "../db/queries.js";

const countriesRouter = Router();

countriesRouter.post("/refresh", async (req, res) => {
    try {
        await queries.postRefresh()
        res.status(200).json( { "message": "Database refresh successful" } );
    }
    catch(err) {
        res.status(500).json( { "error": "Internal server error" } );
    }
});

countriesRouter.get("/", async (req, res) => {
    try {
        const params = req.query
        if (Object.keys(params).length === 0) {
            const arrayOfCountryObjects = await queries.getCountries(
                {
                    allOnly: true,
                    oneOnly: false,
                    statusOnly: false
                }
            )
            return res.status(200).json(arrayOfCountryObjects);
        } else {
            const arrayOfCountryObjects = await queries.getCountries(
                {
                    allOnly: true,
                    oneOnly: false,
                    statusOnly: false,
                    allOnlyQuery: params
                }

            )
            return res.status(200).json(arrayOfCountryObjects);
        }
    } catch(err) {
        if (err instanceof Error) {
            if (err.message) {
                switch(err.message) {
                    case '503':
                        const API = err.message.split(' ')[1] 
                        return res.status(503).json({"error": "External data source unavailable", 
                            "details": `Could not fetch data from ${API}`})
                }
            } else {
                return res.status(500).json({"error": "Internal server error"})
            }
        }
    }
});

countriesRouter.get("/:name", async (req, res) => {
    try {
        if (req.params.name !== undefined) {
        const countryObject = queries.getCountries({
            allOnly: false,
            statusOnly: false,
            oneOnly: true,
            oneCountryName: req.params.name
        })
        return res.status(200).json(countryObject)
        } else {
            return res.status(400).json({ "error": "Validation failed" })
        }
    }
    catch (err){
        if (err instanceof Error) { 
            if (err.message === '404') {
                return res.status(404).json({ "error": "Country not found" })
            }
        }
        return res.status(500).json({"error": "Internal server error"})   
    }
});

countriesRouter.delete("/:name", async (req, res) => {
    try {
        if (req.params.name !== undefined) {
            const result = await queries.deleteCountry(req.params.name)
            if (result?.rowCount === 0) {
      return res.status(404).json({ error: "Country not found" });
    }
            return res.status(200).json({ message: `Country '${name}' deleted successfully` });
        } else {
            return res.status(400).json({ "error": "Validation failed" })
        }
    }
    catch (err){
        return res.status(500).json({"error": "Internal server error"})   
    }
});

countriesRouter.get("/image", (req, res) => {
    try {
        const imgPath = queries.getImage()
        res.sendFile(imgPath);
    }
    catch(err) {
        if (err instanceof Error) {
            if (err.message) {
                return res.status(404).json({ "error": "Summary image not found" })
            }
        } else {
            res.status(500).json({ "error": "Internal server error" })
        }
    }
});

export default countriesRouter;