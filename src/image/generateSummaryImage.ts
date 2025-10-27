import path from 'path'
import nodeHtmlToImage from 'node-html-to-image'

async function generateImage(totalCountryNumber : number, top5GDPCountries : {}[], timestamp : string) {
    const outputPath = path.join(process.cwd(), "summary.png")

    await nodeHtmlToImage({
        output: outputPath,
        html: `
            <html>
                <head>
                    <style>
                        body {
                            width: 600px;
                            height: 300px;
                            background: linear-gradient(135deg, #0b132b, #1c2541);
                            color: #fff;
                            font-family: Arial, sans-serif;
                            padding: 20px;
                            margin: auto;
                        }
                        h1 { color: #00b4d8; }
                        .top5 { margin-top: 10px; }
                        footer {
                            font-size: 12px;
                        }
                    </style>
                </head>
                <body>
                    <h1>Country Summary</h1>
                    <div>Total Countries: {{totalCountryNumber}}</div>
                    <div>
                        <strong>Top 5 countries by GDP</strong>
                        {{#each top5GDPCountries}}
                            <div>{{@index+1}}. {{this.name}} — {{this.gdp}}</div>
                        {{#each}}
                    </div>
                    <footer>Last Updated: {{timestamp}}</footer>
                </body>
            </html>
        `,
        content: { totalCountryNumber, top5GDPCountries, timestamp}
    })
}

export default generateImage