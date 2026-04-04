import urllib.request
import re

def get_ttf(family="Roboto"):
    url = f"https://fonts.googleapis.com/css?family={family}"
    # Use User-Agent for an old browser to force TTF
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Linux; U; Android 2.2; en-us; Nexus One Build/FRF91) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1"
    })
    
    try:
        with urllib.request.urlopen(req) as response:
            css = response.read().decode('utf-8')
            print("CSS returned:")
            print(css[:300]) # Print first 300 chars to check if it has .ttf
            
            # Find the url(...) for TTF
            urls = re.findall(r"url\((.*?\.ttf)\)", css)
            if urls:
                print(f"Found TTF URLs: {urls}")
                return urls[0]
            else:
                print("No TTF found in CSS.")
    except Exception as e:
        print("Error:", e)

get_ttf("Chewy")
get_ttf("Bangers")
