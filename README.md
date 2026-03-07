# Parts Command Center Pro

Static dashboard scaffold for dealership parts operations.

## Includes
- Inventory Health (DP1 + DP6)
- Demand & Lost Sales (DP2 + DP3)
- Purchasing Discipline (DP4 + DP5)
- Operational Performance (DP7 + DP8)
- Action Center alerts
- Health Score
- Data Health / row-count coverage

## Local run
Use any static server, for example:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## Notes
- `app.js` is wired to local files under `/data`.
- You can swap each file path to a GitHub raw URL.
- DP2 includes report-header handling.
- Metrics are management-facing and can be tuned further.
