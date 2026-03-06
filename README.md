# Parts Command Center

Static dashboard for dealership parts operations using 8 CSV data points.

## Included files

- `index.html` — dashboard shell
- `style.css` — component styling
- `app.js` — CSV loading, metrics, charts, and tables
- `data/` — place the 8 CSV files here

## Expected CSV filenames

- `parts_data_point_1.csv`
- `parts_data_point_2.csv`
- `parts_data_point_3.csv`
- `parts_data_point_4.csv`
- `parts_data_point_5.csv`
- `parts_data_point_6.csv`
- `parts_data_point_7.csv`
- `parts_data_point_8.csv`

## Notes based on your actual files

### DP2 special cleanup
DP2 includes report-title rows above the real header. `app.js` automatically finds the line:

`MF Part Number/Description,Date,Qty,Net,Extension`

and parses from there.

### What the dashboard currently shows

## Panel 1 — Inventory Health
Uses DP1 + DP6:
- total inventory value
- dead stock value and %
- non-stock count
- top dead stock list

## Panel 2 — Demand & Lost Sales
Uses DP2 + DP3:
- in-stock sales total
- emergency purchase spend
- fast movers
- phase-in candidates where EP frequency >= 3

## Panel 3 — Purchasing Discipline
Uses DP4 + DP5:
- stock vs special order % based on placed cost
- open core value
- core return quantity

## Panel 4 — Operational Performance
Uses DP7 + DP8:
- open RO parts sales
- pending gross
- shelf / EP / SO fill mix

## Local test
Use a static web server because browsers often block CSV fetches from `file://`.

Examples:

### Python
```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Cloudflare Pages
1. Upload this folder to your GitHub repo.
2. Set Pages project root to the folder.
3. No build command needed.
4. No output directory needed if deploying the folder root directly, or set output to `/` depending on your setup.

## GitHub raw mode
You can change any `DATA_SOURCES.dpX.path` in `app.js` to a raw GitHub URL.

Example:
```js
DATA_SOURCES.dp1.path = "https://raw.githubusercontent.com/BabakRosewater/parts/main/data/parts_data_point_1.csv";
```
