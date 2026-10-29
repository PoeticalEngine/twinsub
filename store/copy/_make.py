# Helper for writing a locale's copy file in the same shape as en.json.
import json, sys
SCENES = ["city", "sunset", "studio", "forest", "night"]
def make(loc, font, messages, shots, pairs, promo, marquee, description):
    keys = ["chips", "callouts", "stat", "bullets", "privacy"]
    out = []
    for i, (s, (o, t)) in enumerate(zip(shots, pairs)):
        d = {"scene": SCENES[i], "eyebrow": s[0], "title": s[1], "sub": s[2], "orig": o, "trans": t, keys[i]: s[3]}
        if i == 3: d["popup"] = True
        out.append(d)
    if len(messages["extDescription"]) > 132: print("WARN", loc, "description", len(messages["extDescription"]))
    en = json.load(open("en.json"))
    missing = set(en["messages"]) - set(messages)
    assert not missing, (loc, missing)
    json.dump({"font": font, "messages": messages, "shots": out, "promo": promo,
               "marquee": {"title": marquee[0], "sub": marquee[1], "orig": pairs[0][0], "trans": pairs[0][1]},
               "description": description.strip()}, open(f"{loc}.json", "w"), ensure_ascii=False, indent=1)
    print(loc, "ok", len(messages["extDescription"]))
A = "The best time to start was yesterday. The next best time is now."
B = "今日はちょっと寄り道してみようか。"
C = "이 장면은 꼭 다시 보고 싶어요."
D = "On ne voit bien qu'avec le cœur."
E = "Wir sehen uns morgen am Bahnhof."
ES = "Nunca es tarde para empezar de nuevo."
FRE = "On se voit demain à la gare."
LATIN = '-apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif'
