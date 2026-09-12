# Export interchange schema (v2.8.2+)

Two portable formats. Both import back through Settings → Import (additive merge:
incoming days fill gaps, existing logs are never deleted).

## JSON backup (`period-tracker-backup-YYYY-MM-DD.json`)

```json
{
  "app": "period-tracker",
  "version": 3,
  "exportedAt": "2026-09-04T00:00:00.000Z",
  "settings": { "...all Settings fields..." },
  "entries": [ { "date": "2026-09-01", "...all DayEntry fields..." } ]
}
```

Full fidelity, including settings, kick log, appointments, tracker order,
custom symptoms/moods. Restores everything (replaces local state).

## CSV (`period-tracker-YYYY-MM-DD.csv`)

Header (order-independent, unknown columns ignored):

```
date,flow,clots,symptoms,moods,mucus,note,bbt,weight,lhTest,pregnancyTest,
sleepHours,steps,water,painLevel,painAreas,migraine,migraineAura,migraineMed,
migraineHelped,giIssues,bladderPain,endoFlare,checkedIn
```

- Lists use `|` separators (`Cramps|Bloating`); booleans are `1`/empty.
- `bbt` in °C, `weight` in kg (canonical units, never display units).
- Enum ids are lowercase (`medium`, `eggwhite`, `positive`); anything else is
  accepted case-insensitively on import, unknown values become empty.
- Missing columns are fine — import merges per field.

## Apple Health (`export.xml`)

Weight (kg/lb/g/oz), temperature (°C/°F/K), summed steps, sleep (attributed to
the wake day). Unknown units and record types are skipped, never stored raw.

## Wearable CSV (Oura/Fitbit/Withings/Health Connect dumps)

Headers auto-mapped by synonym (`temp`, `weight kg`, `total steps`, `sleep
hours`, …; exact match first, token match second). Units inferred from
magnitude (temp > 45 → °F; avg weight > 250 → lb, else metric). Dates accept
ISO or D/M/Y (DD/MM preferred for Hindi locale). Ambiguous files report the
assumed units in the import message.
