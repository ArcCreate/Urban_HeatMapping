Phase 0 – Core Scope & Tech Choices (30–60 min)
Pilot scope (King County)
Spatial unit: census block or block group if you can get it quickly; if not, census tract for faster joins.

Time horizon: a simple 2030s vs today comparison using pre‑computed climate projections (or local SCAP statements) rather than full NEX‑GDDP processing.

Outputs to implement in hackathon version:

Future heat metric per unit: simple score like “projected hot‑day frequency” using current heat map + a climate delta.

Risk score: combine heat + tree canopy + demographics into a normalized 0‑100 score.

Micro‑intervention impact: tree‑planting only; model impact as a small temperature drop per new tree, then recompute risk.

Interactive map + chat: show layers, let user click a unit, and ask “why is this high risk?” or “show only Kent / Seattle / Renton”.

Stack (optimize for speed)
Backend/API + simple logic: FastAPI (Python) or Node/Express. Pick what you ship fastest in Claude Code.

Data handling: Pandas + GeoPandas; pre‑compute and save a GeoJSON with all per‑unit fields for the front‑end.

Front‑end: React + MapLibre GL JS (Leaflet also works and is simpler).

Chat: thin wrapper around LLM API (e.g., Claude) with RAG over your per‑unit data.

Phase 1 – Data Acquisition & “Minimal Modeling” (3–4 hours)
Goal: assemble one GeoJSON for King County units with baseline heat, canopy, simple health/vulnerability proxy, and a rough climate delta.

1. Use existing King County / Seattle tools
King County Heat and Health Data Explorer already maps 2020 street‑level heat, tree canopy, and health/equity factors at census block level.

The Explorer includes relative heat units, tree canopy coverage, adults with diabetes, severe housing cost burden, etc., at block level.
​

Look for a link to the underlying feature layer (ArcGIS REST service) or a data download in that app.

Seattle canopy cover: city’s 2021 canopy study quantifies canopy loss and documents relationship between canopy and temperature (13% canopy → ~0.5°F reduction).

Seattle climate vulnerability assessment: provides narrative + possibly shapefiles for climate vulnerability in Seattle neighborhoods, including heat dome impacts.
​

Implementation steps:

From the ArcGIS Heat and Health Data Explorer, extract:

Spatial features: census blocks (or block groups) geometries and IDs.

Attributes: heat_index_2020 (or similar), canopy_pct, equity_index, health_indicators (e.g., diabetes prevalence, cost burden).
​

If direct export is hard, you can:

Use the ArcGIS REST services JSON endpoint (ArcGIS API) to pull features into a script.

As fallback, look for related shapefiles on King County’s open data portal or through the Explorer’s “Data” link.

2. Climate projections (simplified)
Given 24 hours, do not fully process NEX‑GDDP netCDF. Instead:

Use King County’s Strategic Climate Action Plan:

It states that by the 2050s, days over 90°F will triple in King County relative to historical baselines.
​

Implementation:

Define a global constant like heat_multiplier_2050 = 3.0 (or 1.5 for 2030 as a compromise).

For each unit: future_heat = baseline_heat * heat_multiplier.

Document clearly in the UI that this is a scenario‑style estimate, not a detailed climate model.

If you really want NEX‑GDDP:

Fetch a single cell or small grid over King County from NEX‑GDDP‑CMIP6, compute daily hot‑day deltas, and apply the same delta to all units (coarse but still defensible).
​

3. Simple health/vulnerability score
You do not have time to connect individual health outcomes, so:

Use fields already in the Heat and Health Explorer: e.g., tree canopy, diabetes, socioeconomic burden, equity index.

Normalize each 0–1:

heat_score = rank(baseline_heat) within county.

canopy_gap = 1 - canopy_pct/target_canopy (e.g., target = 30% or Seattle’s 30% goal).

health_score from health indicators (diabetes, housing cost).

equity_score from county’s racial/social equity index.

Then define:

text
risk_score = 0.4 * heat_score +
             0.3 * canopy_gap +
             0.2 * health_score +
             0.1 * equity_score
Weights are tunable but should emphasize heat & canopy/equity per local docs.

4. Export unified dataset
Write a preprocessing script (Claude Code) that:

Loads the ArcGIS/King County feature layer into GeoPandas.

Computes: baseline_heat, future_heat, canopy_pct, canopy_gap, health_score, equity_score, risk_score, city_name (via spatial join with municipal boundaries).

Exports:

king_county_units.geojson (for the map).

units.json (id → attributes) for fast API responses / chat context.

Phase 2 – Minimal Models & Micro‑Interventions (3–4 hours)
You can skip “real ML” and use rules + simple linear relationships grounded in local evidence.

1. Future heat metric per unit
For v1 hackathon:

future_heat_index = baseline_heat * heat_multiplier_2050 from SCAP.
​

Optionally, map to “low/medium/high/very high” categories for easier interpretation.

2. Risk score as formal output
Your earlier formula becomes your “model” translating heat + vulnerability to risk score. Expose it via an API:

GET /api/units → list of units with risk, baseline_heat, future_heat, canopy_pct.

GET /api/units/{id} → detailed metrics for that unit.

3. Micro‑interventions: trees only
You can get a convincing micro‑intervention story using Seattle canopy research:

Seattle reports that at the neighborhood scale, a 13% increase in canopy corresponds to ~0.5°F cooling.
​

Approximate: each 1% canopy ↑ → 0.04°F ↓.

Implementation:

For each unit, compute plantable capacity as max(0, target_canopy - canopy_pct).

Assume 1 tree = 0.1% canopy (or similar; hard‑coded).

Given N trees to plant in unit:

delta_canopy = trees * 0.1

delta_temp = -0.04 * delta_canopy (F or convert to a normalized heat metric).

future_heat_new = future_heat + delta_temp_rescaled (if using heat index score).

Recompute risk:

Recalculate heat_score based on future_heat_new and then risk_score_new.

For hackathon, treat the “100 trees to allocate” as:

For each unit, compute benefit per tree:

benefit_per_tree = (risk_score - risk_score_new_if_10_trees)/10.

Select top units by benefit_per_tree, constrained by plantable_capacity.

Return a simple list:

json
[
  { "unit_id": ..., "trees": 10, "delta_risk": 0.12 },
  ...
]
You can expose:

POST /api/optimize_trees with { "total_trees": 100, "city_filter": "Seattle" | null }.

Phase 3 – Backend API Design (2–3 hours)
Define a minimal API for the front‑end and chat.

Core endpoints
GET /api/units

Query params:

city (optional).

min_risk, max_risk (optional filters).

Returns: basic attributes + geometry bbox or full geometry (if not too heavy).

GET /api/units/{id}

Returns all attributes used in risk calculation:

baseline_heat, future_heat, canopy_pct, canopy_gap, health_score, equity_score, risk_score, city_name, explanatory_text.

POST /api/optimize_trees

Body: { "total_trees": number, "city": "Seattle" | "Kent" | null }.

Logic:

Filter units by city if specified.

Compute benefit_per_tree.

Sort, then greedily assign trees to top units until you reach total_trees.

Returns: list of recommended units with trees_assigned, delta_risk, and centroid coordinates.

POST /api/chat

Body: { "message": string, "unit_id": string | null, "city": string | null }.

Backend:

Fetch relevant unit attributes and global documentation snippets (SCAP statements, canopy‑temperature relationship, etc.).

Construct a prompt to Claude: “You are an explainer for an urban heat risk map in King County… Here is the data for the selected area… Here are some county‑level facts… Answer the user’s question in simple terms.”

Return: LLM answer.

Implementation notes
Keep everything in a single app.py / server.ts for speed.

Use in‑memory caching (load the GeoJSON / JSON once at startup).

Hard‑code constants and relationships with comments citing the sources.

Phase 4 – Front‑End Map & UI (4–6 hours)
Map Viewer
Use React + MapLibre GL or Leaflet.

Load king_county_units.geojson as a vector layer.

Color by risk_score (e.g., green → yellow → red).

Controls:

Layer toggles: baseline heat, future heat, risk, canopy.

City filter dropdown: All, Seattle, Kent, Renton, etc. (filter on city_name).

Tree optimization input:

Input: number of trees.

Optional: select city.

Button: “Suggest tree planting locations”.

Interaction behavior
Clicking a unit:

Show sidebar with:

Baseline vs future heat metric.

Canopy % and canopy gap.

Health / equity indicators.

Risk score (0–100, maybe category label).

Button: “Ask why this area is high risk”.

Running optimization:

Call POST /api/optimize_trees.

Draw recommended units with a distinct outline or icon (“tree” symbol).

Show summary: “With 100 trees, we reduce total risk X% in these Y high‑risk blocks.”

Chat panel
Right‑side or bottom panel with:

Chat messages (simple list).

Text input and send button.

Context behavior:

If a unit is selected, include the unit_id in chat API call.

If user types “focus on Kent” or “what about Renton?”:

Use front‑end logic to set city field in request.

Backend uses city filter to pull top risk units and summarize.

Example questions to test:

“Why is this block so high‑risk?”

“Which neighborhoods in South King County should get trees first?”

“How will climate change affect heat in Seattle vs Kent?”

“What happens if we plant 100 trees in Tukwila?”

Phase 5 – Model Explainability for Chat (2–3 hours)
You want the chat to explain why a unit has high risk in human terms.

1. Build unit‑level explanation strings
During preprocessing, compute a simple text explanation:

Example template:

“This area has high heat risk because it gets hotter than most of King County during extreme heat (heat score in the top 20%), has below‑average tree canopy (15% vs 30% goal), and many residents face health and economic challenges (high diabetes rates and severe housing cost burden).”

Generate this sentence using thresholds:

If heat_score > 0.8 → “gets hotter than most of King County…”.

If canopy_gap > 0.5 → “has below‑average tree canopy…”.

If health_score > 0.7 → “many residents face health and economic challenges…”.

Store as explanatory_text.

2. Chat prompt construction
For POST /api/chat:

Fetch unit info (if unit_id present).

Build context:

Short system description: “You explain an urban heat risk map for King County…” referencing:

2020 heat mapping campaign revealed urban heat islands tied to injustice and asphalt/treeless neighborhoods.

SCAP projection: 3x more days over 90°F by 2050.
​

Relationship between canopy and temperature (~0.5°F reduction for 13% more canopy).
​

Embed the unit’s attributes and explanatory_text.

Ask Claude to answer concisely, referencing:

Heat, canopy, health/equity drivers.

City context if city field is provided.

Example backend prompt skeleton:

text
You are helping residents and planners understand an urban heat risk map
for King County, Washington. You have data from King County's 2020 street-
level heat mapping, tree canopy assessments, and health/equity indicators.[web:52][web:55]
By the 2050s, King County is projected to have about three times as many
days over 90°F compared to the past.[web:49]
At the neighborhood scale, a 13% increase in tree canopy has been associated
with roughly a 0.5°F cooling in Seattle.[web:50]

Here is the data for the selected area:
<insert JSON of unit attributes + explanatory_text>

User question:
<user message>

Explain in clear language why this area has the risk level it does, and,
if relevant, how planting trees can help.
Then return Claude’s answer to the UI.

Phase 6 – Hackathon Polish & Demo Flow (2–3 hours)
Demo script
Start with county‑wide map, show baseline vs future heat layer (slider).

Switch to risk layer, highlight:

South King County hot spots and connect to local discussions about heat, injustice, and treeless neighborhoods.

Click a high‑risk block in Kent / South Seattle:

Show metrics, explanation text.

Use chat: “Why is this block high risk?” → show LLM explanation.

Run tree optimization for “100 trees in South King County”.

Show recommended blocks where trees would most reduce risk.

Use chat: “What difference would these trees make for residents?”

Filter to Seattle and show how canopy goals connect to heat resilience.

Priorities (if time runs short)
Must‑have:

Precomputed GeoJSON with risk scores.

Single map view with risk coloring.

Click‑to‑inspect + minimal chat explanation.

Nice‑to‑have:

City filters.

Tree optimization and re‑rendering.

Separate baseline vs future heat layers.

Phase Summary for Claude Build Agent
Phase 1 – Preprocess data (backend script)
Inputs: King County Heat & Health Explorer feature layer; Seattle canopy/climate narrative.

Outputs: king_county_units.geojson, units.json with risk, future_heat, explanatory_text.

Phase 2 – Implement backend API (FastAPI/Express)
Endpoints: /api/units, /api/units/{id}, /api/optimize_trees, /api/chat.
Logic: simple formulas for future_heat, risk_score, tree benefit; RAG context for chat.

Phase 3 – Front‑end map (React + MapLibre/Leaflet)
Features: risk choropleth, unit click, sidebar details, city filter, tree optimization overlay, chat panel.

Phase 4 – Chat integration
Prompt: use unit attributes + King County/Seattle facts for explanations.

Behavior: answer “why high risk?” and “what if we plant trees?” for selected unit or city.

If you want, next step I can sketch concrete data schemas and pseudo‑code for the preprocessing script and each endpoint so you can paste them directly into Claude Code.

Based on these datasets, keep the integrity of the markdown you just gave me but for the databse, instead use duckdb and make sure to include an element of training the model using XGBoost and tensorflow as I want these to target my 3 primary outputs (redicting future heat metrics per speatial unit, translating heat and vulnerability to health relevant risk scores, and estimating marginal impact of micro interventions and optimizing the allocation of these.). Update the markdown plan accordingly.

2 attachments
Below is an updated spec that keeps the previous structure but swaps in DuckDB for storage/analytics and adds concrete XGBoost and TensorFlow training steps for your three primary outputs, wired to your two CSVs.

Phase 1 – Data Model Using DuckDB (backend script)
1. Files and schemas
You have two key CSVs:

blocks20_attributes_0.csv – block‑level attributes with:

Heat: Median morning/afternoon/evening temperature, quintile ranks.
​

Land: Percent tree coverage, Percent impervious coverage, Mean distance to water.
​

Geography: BLOCK GEO ID, TRACT GEO ID, CITYNAME, HRA names.
​

Health: Cardiovascular disease mortality rate, Percent adults with diabetes, life expectancy, etc.
​

Vulnerability: SVI overall and theme scores, poverty, disability, limited English, housing cost burden, family structure, etc.
​

Sheet-2-Table-1.csv – tract‑level predictions of heat‑related health risk:

GEOID / TRACT / NAME.

PRED0E, PRED0M, PRED0P, etc. (exposure/mortality probabilities under different heat scenarios) and LONG90DAYMAXWBTEXPOSED.
​

2. DuckDB setup
In a preprocessing script (Python, run via Claude Code):

Initialize DuckDB and register both CSVs:

python
import duckdb

con = duckdb.connect("king_county.duckdb")

con.execute("""
CREATE TABLE blocks AS
SELECT * FROM read_csv_auto('blocks20_attributes_0.csv', header=True, ignore_errors=True);
""")

con.execute("""
CREATE TABLE tract_preds AS
SELECT * FROM read_csv_auto('Sheet-2-Table-1.csv', header=True, ignore_errors=True);
""")
Normalize keys:

In blocks, keep TRACT GEO ID as a 11‑digit GEOID (match to tract part of GEOID in tract_preds).

In tract_preds, strip any prefixes to get tract GEOID (e.g., last 11 chars of GEOIDSTATECOUNTYTRACT).

Example:

sql
ALTER TABLE tract_preds ADD COLUMN TRACT_GEOID VARCHAR;
UPDATE tract_preds
SET TRACT_GEOID = RIGHT(GEOIDSTATECOUNTYTRACT, 11);
Create a tract‑level view from blocks (to align with tract predictions):

sql
CREATE TABLE tract_blocks AS
SELECT
  "TRACT GEO ID" AS TRACT_GEOID,
  AVG("Median afternoon temperature") AS mean_afternoon_temp,
  AVG("Median morning temperature") AS mean_morning_temp,
  AVG("Median evening temperature") AS mean_evening_temp,
  AVG("Percent tree coverage") AS mean_tree_cov,
  AVG("Percent impervious coverage") AS mean_imperv,
  AVG("Cardiovascular disease mortality rate") AS mean_cvd_rate,
  AVG("Percent adults with diabetes") AS mean_diabetes,
  AVG("SVI Overall percentile ranking") AS mean_svi_overall,
  AVG("Percent under 18 years old") AS mean_under18,
  AVG("Percent severe housing cost burdened") AS mean_severe_cost,
  AVG("Percent of population whose income in the past 12 months is under 2.00x 200 of the federal poverty level") AS mean_poverty2x,
  AVG("Percent of population with a disability") AS mean_disability,
  AVG("Percent of adults 18 years and over who have limited English ability") AS mean_limited_english,
  ANY_VALUE(CITYNAME) AS city_name
FROM blocks
GROUP BY "TRACT GEO ID";
Join to tract‑level predictions:

sql
CREATE TABLE tract_features AS
SELECT
  t.TRACT_GEOID,
  b.* EXCLUDE (TRACT_GEOID),
  t.PRED0E, t.PRED0M, t.PRED0P,
  t.PRED12E, t.PRED12M, t.PRED12P,
  t.PRED3E, t.PRED3M, t.PRED3P,
  t.LONG90DAYMAXWBTEXPOSED
FROM tract_blocks b
JOIN tract_preds t
  ON b.TRACT_GEOID = t.TRACT_GEOID;
Export a Geo‑agnostic feature table:

python
con.execute("COPY tract_features TO 'tract_features.parquet' (FORMAT PARQUET);")
You’ll load tract_features into Python for model training.

Phase 2 – Model 1: Future Heat Metrics per Spatial Unit
You lack explicit future climate deltas in the CSVs, so approximate “future heat” with a learned function of tract characteristics plus a constant climate warming factor.

1. Targets
Base target: mean_afternoon_temp (or daily max analog from your data).
​

Future target for training proxy:

Define future_temp_label = mean_afternoon_temp + climate_delta, with a fixed climate_delta (e.g., +2 °C) based on King County projections; you can later let user choose +1/+2/+3 °C scenarios.

For ML training, you train on current mean_afternoon_temp but use model as a mapping from features to baseline heat, then add delta for future.

2. Features
From tract_features:

Heat & land:

mean_afternoon_temp, mean_morning_temp, mean_evening_temp.

mean_tree_cov, mean_imperv.

Health & vulnerability:

mean_cvd_rate, mean_diabetes, mean_svi_overall,

mean_poverty2x, mean_under18, mean_severe_cost, mean_disability, mean_limited_english.

Maybe LONG90DAYMAXWBTEXPOSED as another heat exposure summary.
​

3. XGBoost regression for baseline heat
In a training script:

python
import duckdb, pandas as pd
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score, mean_absolute_error

con = duckdb.connect("king_county.duckdb")
df = con.execute("SELECT * FROM tract_features").fetchdf()

feature_cols = [
    "mean_morning_temp", "mean_evening_temp",
    "mean_tree_cov", "mean_imperv",
    "mean_cvd_rate", "mean_diabetes",
    "mean_svi_overall", "mean_poverty2x",
    "mean_under18", "mean_severe_cost",
    "mean_disability", "mean_limited_english"
]

X = df[feature_cols]
y = df["mean_afternoon_temp"]

X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)

heat_model = XGBRegressor(
    n_estimators=300,
    max_depth=4,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8
)
heat_model.fit(X_train, y_train)

y_pred = heat_model.predict(X_val)
print("R2:", r2_score(y_val, y_pred), "MAE:", mean_absolute_error(y_val, y_pred))
Save model: heat_model.json or heat_model.pkl.

4. Future heat inference
At runtime (API):

Load tract_features from DuckDB.

Compute baseline_heat_pred = heat_model.predict(X).

For scenario ΔT (e.g., 2 °C): future_heat_pred = baseline_heat_pred + ΔT.

Store per tract in memory or cache for the front‑end and risk model.

Phase 3 – Model 2: Heat + Vulnerability → Health Risk Scores
You have tract‑level PRED0/PRED12/PRED3 outputs already (climate‑health modeling results) and rich vulnerability features. Use XGBoost and TensorFlow to create an explainable heat‑health risk model.

1. Targets
Pick one primary health risk target, e.g.:

PRED12P – probability or rate of health impact under “mid‑century heat scenario 2” (you choose whichever column is most interpretable).
​

Also keep others for experimentation.

2. Features
Use:

Predicted or observed heat:

mean_afternoon_temp or baseline_heat_pred.

LONG90DAYMAXWBTEXPOSED.

Vulnerability & health:

mean_svi_overall, mean_poverty2x, mean_under18,

mean_severe_cost, mean_disability, mean_limited_english,

mean_cvd_rate, mean_diabetes.

3. XGBoost regression for risk
python
from xgboost import XGBRegressor

risk_feature_cols = [
    "mean_afternoon_temp", "LONG90DAYMAXWBTEXPOSED",
    "mean_tree_cov", "mean_imperv",
    "mean_svi_overall", "mean_poverty2x", "mean_under18",
    "mean_severe_cost", "mean_disability", "mean_limited_english",
    "mean_cvd_rate", "mean_diabetes"
]

X_risk = df[risk_feature_cols]
y_risk = df["PRED12P"]

X_train, X_val, y_train, y_val = train_test_split(X_risk, y_risk, test_size=0.2, random_state=42)

risk_model_xgb = XGBRegressor(
    n_estimators=400,
    max_depth=4,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8
)
risk_model_xgb.fit(X_train, y_train)
Normalize to 0–100 for UI:

python
df["risk_score_baseline"] = 100 * (risk_model_xgb.predict(X_risk) - y_risk.min()) / (y_risk.max() - y_risk.min())
4. TensorFlow dense network for risk (for deep model and future extensibility)
A small MLP you can train quickly:

python
import tensorflow as tf
from sklearn.preprocessing import StandardScaler

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X_risk.values)

X_train_s, X_val_s, y_train_s, y_val_s = train_test_split(X_scaled, y_risk.values, test_size=0.2, random_state=42)

inputs = tf.keras.Input(shape=(X_train_s.shape[1],))
x = tf.keras.layers.Dense(64, activation="relu")(inputs)
x = tf.keras.layers.Dense(32, activation="relu")(x)
outputs = tf.keras.layers.Dense(1, activation="linear")(x)

risk_model_tf = tf.keras.Model(inputs, outputs)
risk_model_tf.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss="mse")

risk_model_tf.fit(
    X_train_s, y_train_s,
    validation_data=(X_val_s, y_val_s),
    epochs=50,
    batch_size=32,
    verbose=0
)
Save risk_model_tf.h5 and risk_scaler.pkl.

For hackathon, you can compute both XGBoost and TF predictions and decide which to use; XGBoost will give you better explainability (feature importances / SHAP) for the chat.

Phase 4 – Model 3: Marginal Impact of Micro‑Interventions + Optimization
You can still stay simple but now have a risk model to differentiate marginal impact.

1. Intervention design (tree planting at tract level)
Use mean_tree_cov and perhaps quintile ranks from blocks aggregated to tracts.
​

Per tract:

Assume:

Target canopy: e.g., 30%.

Each “unit intervention” (say, 10 trees) increases canopy by delta_canopy = 0.5% (tunable).

Approximate local temperature sensitivity:

Use literature‑based constant, e.g., beta_canopy = 0.04°F per 1% canopy, or calibrate a simple linear regression within your data: regressing mean_afternoon_temp on mean_tree_cov across tracts.
​

For each additional unit u in tract i:

delta_temp_i(u) = -beta_canopy * delta_canopy.

New heat: future_heat_i' = future_heat_pred_i + delta_temp_i(u).

2. Recompute risk for each candidate intervention
For the hackathon, precompute risk per one unit of intervention per tract:

python
# For each tract row in df:
heat_before = df.loc[i, "future_heat_pred"]
X_risk_i = df.loc[i, risk_feature_cols].copy()

# 1. With no extra trees: risk_before
risk_before = risk_model_xgb.predict(X_risk_i.to_frame().T)[0]

# 2. With +delta_canopy:
X_risk_i_mod = X_risk_i.copy()
X_risk_i_mod["mean_tree_cov"] = X_risk_i_mod["mean_tree_cov"] + delta_canopy
# Adjust temperature as well
X_risk_i_mod["mean_afternoon_temp"] = heat_before + delta_temp

risk_after = risk_model_xgb.predict(X_risk_i_mod.to_frame().T)[0]
delta_risk = risk_before - risk_after  # positive is good
Store:

benefit_per_unit = delta_risk.

max_units based on (target_canopy - mean_tree_cov) / delta_canopy.

3. Greedy optimization
Endpoint POST /api/optimize_trees:

Inputs: total_units (e.g., 10 units = 100 trees) and optional city.

Filter tracts by city if specified (city_name from tract_blocks).
​

Sort by benefit_per_unit descending.

Greedily allocate units until total_units exhausted or per‑tract max_units reached.

Return for front‑end:

json
[
  {
    "tract_geoid": "...",
    "city": "Kent",
    "units_assigned": 3,
    "trees_assigned": 30,
    "delta_risk": 0.15
  },
  ...
]
Phase 5 – DuckDB‑backed API and Map Data
1. Materialized outputs for UI
After training, bake a tract‑level table with all outputs:

sql
CREATE TABLE tract_outputs AS
SELECT
  TRACT_GEOID,
  city_name,
  mean_afternoon_temp,
  mean_tree_cov,
  mean_imperv,
  mean_svi_overall,
  mean_poverty2x,
  mean_under18,
  mean_severe_cost,
  mean_disability,
  mean_limited_english,
  mean_cvd_rate,
  mean_diabetes
FROM tract_features;
In Python:

Load tract_outputs.

Compute and attach:

baseline_heat_pred.

future_heat_pred.

risk_score_baseline, risk_score_future.

benefit_per_unit, max_units.

Save as tract_outputs_with_preds.parquet and also a smaller JSON (tracts.json) for the API.

2. API endpoints (DuckDB + models)
Backend loads:

DuckDB connection.

Tract outputs (as DataFrame or via queries).

XGBoost models, TF risk model + scaler.

Precomputed micro‑intervention benefits.

Endpoints (as before):

GET /api/tracts (with city / risk filters).

GET /api/tracts/{geoid}.

POST /api/optimize_trees.

POST /api/chat.

All computations can be done either:

Directly from cached pandas DataFrames, or

On the fly from DuckDB using con.execute with filtering.

Phase 6 – Chat Explanations Using Model Outputs
1. Explanation text generation (precompute)
Using tract_outputs_with_preds:

For each tract, generate a string that mentions:

Whether future_heat_pred is high vs county median.

Whether mean_tree_cov is below target.

Which vulnerability metrics are high (e.g., top quintile SVI, high diabetes).

Example Python:

python
def explanation(row):
    parts = []
    if row["future_heat_pred"] > df["future_heat_pred"].quantile(0.8):
        parts.append("This tract is projected to be among the hottest in King County during future heat waves.")
    if row["mean_tree_cov"] < 15:
        parts.append("It has relatively low tree canopy, which means less natural shade and cooling.")
    if row["mean_svi_overall"] > 0.8:
        parts.append("Residents here face high social vulnerability, including economic and housing challenges.")
    if row["mean_diabetes"] > df["mean_diabetes"].median():
        parts.append("There is also a higher rate of chronic conditions like diabetes, which increases heat risk.")
    return " ".join(parts) or "This tract has moderate projected heat and vulnerability."

df["explanatory_text"] = df.apply(explanation, axis=1)
Include explanatory_text in tract_outputs_with_preds.

2. Chat prompt uses XGBoost / TF outputs
For POST /api/chat:

If tract_geoid is provided:

Fetch that tract’s record (DuckDB or in‑memory).

Include:

baseline_heat_pred, future_heat_pred.

risk_score_future.

explanatory_text.

benefit_per_unit and max_units.

Prompt Claude:

text
You explain an urban heat and health risk map for King County, Washington.
You have model predictions trained on block-level heat, tree canopy,
health, and social vulnerability data, aggregated to census tracts.[file:56][file:57]
The heat model uses XGBoost to predict baseline afternoon temperatures from
land cover, health, and vulnerability features, and we add a climate
warming scenario.[file:56][file:57]
The risk model (XGBoost and a small TensorFlow network) estimates heat-
related health risk (PRED12P) from projected heat plus vulnerability.[file:57]

Here is the tract's data:
<JSON with key fields + explanatory_text>

User question:
<user message>

Explain clearly, using these model outputs, why the tract has this risk level,
what factors contribute (heat, canopy, vulnerability), and how planting trees
could change the risk.
Phase 7 – Build Phases for Claude Code (TL;DR)
Phase A – Data & DuckDB (2–3h)

Load both CSVs into DuckDB.

Aggregate block → tract, join to tract predictions → tract_features.

Export tract_features.parquet.

Phase B – Modeling (3–5h)

Load tract_features in Python.

Train XGBoost heat model (baseline afternoon temp).

Train XGBoost risk model (PRED12P).

Train TensorFlow risk MLP (same target) for future flexibility.

Compute per‑tract future_heat_pred, risk_score_baseline, risk_score_future.

Compute simple tree micro‑intervention benefit per unit.

Phase C – Outputs Table (1–2h)

Merge predictions into tract_outputs_with_preds (DuckDB export).

Add explanatory_text.

Export to Parquet + JSON.

Phase D – API (2–3h)

FastAPI/Express service that:

Connects to DuckDB and loads models.

Implements /api/tracts, /api/tracts/{id}, /api/optimize_trees, /api/chat.

Phase E – Frontend (4–6h)

React + Leaflet/MapLibre with:

Tract layer colored by risk_score_future.

Sidebar showing predictions and explanation.

Tree optimization UI.

Chat panel wired to /api/chat.

This keeps your original hackathon plan but grounds everything in your provided block‑level and tract‑level CSVs, uses DuckDB as the analytical spine, and explicitly trains XGBoost + TensorFlow models for the three primary outputs.


