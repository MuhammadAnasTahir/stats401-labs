import pandas as pd, numpy as np, json, re, datetime

v2 = pd.read_csv("https://raw.githubusercontent.com/zyhe16/top-us-stock-tickers/main/data/v2/tickers.csv", keep_default_na=False)
con = pd.read_csv("constituents.csv")  # Symbol, Security, GICS Sector

v2 = v2[v2["is_sp500"].astype(str).str.lower()=="true"].copy()
for c in ["price","price_change","percent_change","market_cap"]:
    v2[c] = pd.to_numeric(v2[c], errors="coerce")
v2 = v2[(v2["market_cap"]>0) & v2["percent_change"].notna()].copy()

gics = dict(zip(con["Symbol"], con["GICS Sector"]))
gname = dict(zip(con["Symbol"], con["Security"]))
nas2gics = {  # fallback map Nasdaq sector -> GICS for names missing from constituents
 "Technology":"Information Technology","Finance":"Financials","Health Care":"Health Care",
 "Consumer Discretionary":"Consumer Discretionary","Consumer Staples":"Consumer Staples",
 "Energy":"Energy","Industrials":"Industrials","Basic Materials":"Materials",
 "Real Estate":"Real Estate","Utilities":"Utilities","Telecommunications":"Communication Services",
 "Consumer Services":"Consumer Discretionary","Capital Goods":"Industrials","Public Utilities":"Utilities",
 "Basic Industries":"Materials","Transportation":"Industrials","Miscellaneous":"Information Technology"}

def clean_name(s):
    return re.sub(r"\s+(Common Stock|Class [A-C] Common Stock|Common Shares|Ordinary Shares|Inc\.? Common Stock).*$","",s).strip()

def sector_of(sym, nas):
    return gics.get(sym) or nas2gics.get(nas)

v2["sector"] = [sector_of(s,n) for s,n in zip(v2["symbol"], v2["sector"])]
v2["cname"] = [gname.get(s) or clean_name(n) for s,n in zip(v2["symbol"], v2["name"])]
v2 = v2[v2["sector"].notna()].copy()

df = pd.DataFrame({
 "ticker":v2["symbol"], "name":v2["cname"], "sector":v2["sector"],
 "marketCap":v2["market_cap"].round(0).astype("int64"),
 "price":v2["price"].round(2), "priceChange":v2["price_change"].round(2),
 "changePercent":v2["percent_change"].round(2)}).sort_values("marketCap",ascending=False)

out={"meta":{"index":"S&P 500",
  "retrievedDate":datetime.date.today().isoformat(),
  "note":"Single-day snapshot. marketCap and changePercent are from the same daily Nasdaq update, so treemap size and bar change are coherent. Sectors are GICS (11).",
  "sources":{
    "prices_marketcap_change":"https://github.com/zyhe16/top-us-stock-tickers (data/v2/tickers.csv, Nasdaq-sourced, daily)",
    "gics_sector":"https://github.com/datasets/s-and-p-500-companies (constituents.csv)"},
  "company_count":int(len(df))},
  "companies":df.to_dict(orient="records")}
json.dump(out, open("sp500_snapshot.json","w"), indent=1)

print("companies:",len(df),"| sectors:",df.sector.nunique())
print("advancers%%: %.1f | mean%%: %.2f | std%%: %.2f"%((df.changePercent>0).mean()*100, df.changePercent.mean(), df.changePercent.std()))
print("\nTop 10 by market cap:")
for c in out["companies"][:10]:
    print(f'  {c["ticker"]:6s} {c["name"][:24]:24s} ${c["marketCap"]/1e12:5.2f}T  {c["changePercent"]:+.2f}%  [{c["sector"]}]')
print("\nSector counts:"); print(df.groupby("sector").size().sort_values(ascending=False).to_string())
print("\nTop 5 gainers:"); print(df.nlargest(5,"changePercent")[["ticker","sector","changePercent"]].to_string(index=False))
print("Top 5 losers:");  print(df.nsmallest(5,"changePercent")[["ticker","sector","changePercent"]].to_string(index=False))
print("\nsize:",round(len(open('sp500_snapshot.json').read())/1024,1),"KB")
