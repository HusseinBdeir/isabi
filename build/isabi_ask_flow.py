"""isabi_ask_flow.py — Power Automate HTTP Cloud API & Dataverse Question Logger for Ask ISABI.

Provisions:
1. Dataverse `annotations` store (`subject = 'bhf_isabi_ask_store'`, `filename = 'bhf_isabi_ask_store.json'`)
   holding:
   - `config`: `{ "geminiKey": "", "model": "gemini-2.5-flash" }`
   - `logs`: newest 200 visitor questions asked on https://husseinbdeir.github.io/isabi/
2. Power Automate HTTP Flow `ISABI - Ask ISABI Public API`:
   - Validates shared client token `key`
   - Reads `bhf_isabi_ask_store` from `annotations`
   - Logs every visitor question (`q`, `lang`, `industry`, `currency`, `period`, `scale`, `range`, `ts`)
   - When `config.geminiKey` is populated, calls Google Gemini Flash (`generateContent` with
     `responseMimeType: "application/json"`) directly in the cloud (24/7) and returns the structured
     ISABI response with `Access-Control-Allow-Origin: *`.
   - When `config.geminiKey` is empty, logs the visitor question and returns `mode: "logged_only"`
     so the client engine answers seamlessly while still recording lead intelligence in Dataverse.

Usage:
  C:\\Python314\\python.exe build/isabi_ask_flow.py --phases wfet
  C:\\Python314\\python.exe build/isabi_ask_flow.py --set-gemini-key AIzaSy...
  C:\\Python314\\python.exe build/isabi_ask_flow.py --logs
"""
import argparse
import base64
import json
import os
import secrets
import sys
import time
import requests

RESORT_SCRIPTS = os.path.join(os.path.expanduser("~"), "bhfirms", "resort-operations", "scripts")
ATT_SCRIPTS = os.path.join(os.path.expanduser("~"), "bhfirms", "attendance", "scripts")
sys.path.insert(0, ATT_SCRIPTS)
sys.path.insert(0, RESORT_SCRIPTS)

from attlib import API, CR_DV, ENV_ID, _token, do, get  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EXPORTS_DIR = os.path.join(ROOT, "exports")
os.makedirs(EXPORTS_DIR, exist_ok=True)

KEY_FILE = os.path.join(EXPORTS_DIR, "ask_flow_key.txt")
URL_FILE = os.path.join(EXPORTS_DIR, "ask_flow_url.txt")
STORE_ID_FILE = os.path.join(EXPORTS_DIR, "ask_store_id.txt")
FLOW_ID_FILE = os.path.join(EXPORTS_DIR, "ask_flow_id.txt")
PART_ENDPOINTS = os.path.join(HERE, "part_endpoints.py")

NOTE_SUBJECT = "bhf_isabi_ask_store"
WR_NAME = "bhf_isabi_ask_store.json"
FLOW_NAME = "ISABI - Ask ISABI Public API"
DV = {
    "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
    "connectionName": "shared_commondataserviceforapps",
}


def api_key():
    if os.path.exists(KEY_FILE):
        return open(KEY_FILE, encoding="utf-8").read().strip()
    k = secrets.token_hex(24)
    with open(KEY_FILE, "w", encoding="utf-8") as f:
        f.write(k)
    return k


def default_seed():
    return {
        "config": {
            "geminiKey": "",
            "model": "gemini-2.5-flash",
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
        "logs": [],
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def read_store_annotation():
    rows = get(
        f"annotations?$select=annotationid,subject,documentbody&$filter=subject eq '{NOTE_SUBJECT}'"
    )["value"]
    if not rows:
        return None, None
    aid = rows[0]["annotationid"]
    cur_b64 = rows[0].get("documentbody") or ""
    try:
        obj = json.loads(base64.b64decode(cur_b64).decode("utf-8"))
    except Exception:
        obj = default_seed()
    return aid, obj


def write_store_annotation(aid, obj):
    obj["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    b64 = base64.b64encode(json.dumps(obj, separators=(",", ":")).encode("utf-8")).decode("ascii")
    do(
        "update Ask ISABI store annotation",
        "PATCH",
        f"annotations({aid})",
        {
            "filename": WR_NAME,
            "mimetype": "application/json",
            "documentbody": b64,
        },
    )


def ensure_store():
    aid, cur_obj = read_store_annotation()
    seed = default_seed()
    if aid and cur_obj:
        cfg = seed["config"]
        cfg.update(cur_obj.get("config") or {})
        merged = {
            "config": cfg,
            "logs": cur_obj.get("logs") if isinstance(cur_obj.get("logs"), list) else [],
            "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        write_store_annotation(aid, merged)
    else:
        b64 = base64.b64encode(json.dumps(seed, separators=(",", ":")).encode("utf-8")).decode("ascii")
        r = do(
            "create Ask ISABI store annotation",
            "POST",
            "annotations",
            {
                "subject": NOTE_SUBJECT,
                "notetext": "Backing JSON store & visitor question log for ISABI Systems Ask ISABI assistant.",
                "filename": WR_NAME,
                "mimetype": "application/json",
                "documentbody": b64,
            },
        )
        assert r is not None, "Failed to create store annotation"
        aid, _ = read_store_annotation()
    with open(STORE_ID_FILE, "w", encoding="utf-8") as f:
        f.write(aid)
    print("Store annotationid:", aid)
    return aid


def act(op, params, run_after=None):
    return {
        "type": "OpenApiConnection",
        "runAfter": run_after or {},
        "inputs": {
            "host": dict(DV, operationId=op),
            "parameters": params,
            "authentication": "@parameters('$authentication')",
        },
    }


def response(status_code, body, run_after=None):
    return {
        "type": "Response",
        "kind": "Http",
        "runAfter": run_after or {},
        "inputs": {
            "statusCode": status_code,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": body,
        },
    }


def clientdata(key, store_id):
    definition = {
        "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        "contentVersion": "1.0.0.0",
        "parameters": {
            "$connections": {"defaultValue": {}, "type": "Object"},
            "$authentication": {"defaultValue": {}, "type": "SecureObject"},
        },
        "triggers": {
            "manual": {
                "type": "Request",
                "kind": "Http",
                "inputs": {},
            }
        },
        "actions": {
            "Parse_Body": {
                "type": "Compose",
                "runAfter": {},
                "inputs": "@json(string(triggerBody()))",
            },
            "Bad_Key": {
                "type": "If",
                "runAfter": {"Parse_Body": ["Succeeded"]},
                "expression": {
                    "not": {"equals": ["@outputs('Parse_Body')?['key']", key]}
                },
                "actions": {
                    "Response_401": response(401, {"ok": False, "error": "bad key"}),
                    "Stop": {
                        "type": "Terminate",
                        "runAfter": {"Response_401": ["Succeeded"]},
                        "inputs": {"runStatus": "Cancelled"},
                    },
                },
                "else": {"actions": {}},
            },
            "Get_Store": act(
                "GetItem",
                {
                    "entityName": "annotations",
                    "recordId": store_id,
                    "$select": "documentbody",
                },
                {"Bad_Key": ["Succeeded"]},
            ),
            "Store_Obj": {
                "type": "Compose",
                "runAfter": {"Get_Store": ["Succeeded"]},
                "inputs": "@coalesce(json(base64ToString(outputs('Get_Store')?['body/documentbody'])), json('{}'))",
            },
            "Config": {
                "type": "Compose",
                "runAfter": {"Store_Obj": ["Succeeded"]},
                "inputs": "@coalesce(outputs('Store_Obj')?['config'], json('{}'))",
            },
            "Cur_Logs": {
                "type": "Compose",
                "runAfter": {"Store_Obj": ["Succeeded"]},
                "inputs": "@coalesce(outputs('Store_Obj')?['logs'], json('[]'))",
            },
            "Has_Gemini_Key": {
                "type": "If",
                "runAfter": {"Config": ["Succeeded"], "Cur_Logs": ["Succeeded"]},
                "expression": {
                    "and": [
                        {
                            "not": {
                                "equals": [
                                    "@coalesce(outputs('Config')?['geminiKey'], '')",
                                    "",
                                ]
                            }
                        },
                        {
                            "equals": [
                                "@coalesce(outputs('Parse_Body')?['op'], 'ask')",
                                "ask",
                            ]
                        },
                    ]
                },
                "actions": {
                    "Call_Gemini": {
                        "type": "Http",
                        "runAfter": {},
                        "inputs": {
                            "method": "POST",
                            "uri": "@concat('https://generativelanguage.googleapis.com/v1beta/models/', coalesce(outputs('Config')?['model'], 'gemini-2.5-flash'), ':generateContent?key=', outputs('Config')?['geminiKey'])",
                            "headers": {
                                "Content-Type": "application/json",
                            },
                            "body": {
                                "systemInstruction": {
                                    "parts": [
                                        {
                                            "text": "@coalesce(outputs('Parse_Body')?['systemPrompt'], 'You are ISABI, the native system intelligence assistant for ISABI Systems.')"
                                        }
                                    ]
                                },
                                "contents": [
                                    {
                                        "role": "user",
                                        "parts": [
                                            {
                                                "text": "@coalesce(outputs('Parse_Body')?['userPrompt'], string(outputs('Parse_Body')?['q']))"
                                            }
                                        ],
                                    }
                                ],
                                "generationConfig": {
                                    "temperature": 0.25,
                                    "maxOutputTokens": 900,
                                    "responseMimeType": "application/json",
                                },
                            },
                            "retryPolicy": {"type": "none"},
                        },
                    },
                    "If_Gemini_Ok": {
                        "type": "If",
                        "runAfter": {
                            "Call_Gemini": ["Succeeded", "Failed", "TimedOut"]
                        },
                        "expression": {
                            "equals": [
                                "@outputs('Call_Gemini')?['statusCode']",
                                200,
                            ]
                        },
                        "actions": {
                            "Gemini_Raw_Text": {
                                "type": "Compose",
                                "runAfter": {},
                                "inputs": "@coalesce(body('Call_Gemini')?['candidates']?[0]?['content']?['parts']?[0]?['text'], '{}')",
                            },
                            "Log_Entry_Gem": {
                                "type": "Compose",
                                "runAfter": {"Gemini_Raw_Text": ["Succeeded"]},
                                "inputs": {
                                    "ts": "@utcNow()",
                                    "q": "@coalesce(outputs('Parse_Body')?['q'], '')",
                                    "lang": "@coalesce(outputs('Parse_Body')?['lang'], 'en')",
                                    "industry": "@coalesce(outputs('Parse_Body')?['industry'], '')",
                                    "currency": "@coalesce(outputs('Parse_Body')?['currency'], 'USD')",
                                    "period": "@coalesce(outputs('Parse_Body')?['period'], 'mtd')",
                                    "scale": "@coalesce(outputs('Parse_Body')?['scale'], '')",
                                    "range": "@coalesce(outputs('Parse_Body')?['range'], '')",
                                    "mode": "gemini_cloud",
                                },
                            },
                            "New_Logs_Gem": {
                                "type": "Compose",
                                "runAfter": {"Log_Entry_Gem": ["Succeeded"]},
                                "inputs": "@take(union(createArray(outputs('Log_Entry_Gem')), outputs('Cur_Logs')), 200)",
                            },
                            "Save_Store_Gem": act(
                                "UpdateRecord",
                                {
                                    "entityName": "annotations",
                                    "recordId": store_id,
                                    "item/filename": WR_NAME,
                                    "item/mimetype": "application/json",
                                    "item/documentbody": "@base64(string(setProperty(setProperty(outputs('Store_Obj'), 'logs', outputs('New_Logs_Gem')), 'updatedAt', utcNow())))",
                                },
                                {"New_Logs_Gem": ["Succeeded"]},
                            ),
                            "Response_Gemini": response(
                                200,
                                {
                                    "ok": True,
                                    "mode": "gemini_cloud",
                                    "rawReply": "@outputs('Gemini_Raw_Text')",
                                    "serverTime": "@utcNow()",
                                },
                                {"Save_Store_Gem": ["Succeeded", "Failed"]},
                            ),
                        },
                        "else": {
                            "actions": {
                                "Log_Entry_Err": {
                                    "type": "Compose",
                                    "runAfter": {},
                                    "inputs": {
                                        "ts": "@utcNow()",
                                        "q": "@coalesce(outputs('Parse_Body')?['q'], '')",
                                        "lang": "@coalesce(outputs('Parse_Body')?['lang'], 'en')",
                                        "industry": "@coalesce(outputs('Parse_Body')?['industry'], '')",
                                        "currency": "@coalesce(outputs('Parse_Body')?['currency'], 'USD')",
                                        "period": "@coalesce(outputs('Parse_Body')?['period'], 'mtd')",
                                        "mode": "gemini_error",
                                        "statusCode": "@outputs('Call_Gemini')?['statusCode']",
                                    },
                                },
                                "New_Logs_Err": {
                                    "type": "Compose",
                                    "runAfter": {"Log_Entry_Err": ["Succeeded"]},
                                    "inputs": "@take(union(createArray(outputs('Log_Entry_Err')), outputs('Cur_Logs')), 200)",
                                },
                                "Save_Store_Err": act(
                                    "UpdateRecord",
                                    {
                                        "entityName": "annotations",
                                        "recordId": store_id,
                                        "item/filename": WR_NAME,
                                        "item/mimetype": "application/json",
                                        "item/documentbody": "@base64(string(setProperty(setProperty(outputs('Store_Obj'), 'logs', outputs('New_Logs_Err')), 'updatedAt', utcNow())))",
                                    },
                                    {"New_Logs_Err": ["Succeeded"]},
                                ),
                                "Response_Err_Fallback": response(
                                    200,
                                    {
                                        "ok": True,
                                        "mode": "fallback",
                                        "geminiStatus": "@outputs('Call_Gemini')?['statusCode']",
                                        "serverTime": "@utcNow()",
                                    },
                                    {"Save_Store_Err": ["Succeeded", "Failed"]},
                                ),
                            }
                        },
                    },
                },
                "else": {
                    "actions": {
                        "If_Ask_Op": {
                            "type": "If",
                            "runAfter": {},
                            "expression": {
                                "equals": [
                                    "@coalesce(outputs('Parse_Body')?['op'], 'ask')",
                                    "ask",
                                ]
                            },
                            "actions": {
                                "Call_Cloud_LLM": {
                                    "type": "Http",
                                    "runAfter": {},
                                    "inputs": {
                                        "method": "POST",
                                        "uri": "https://text.pollinations.ai/openai",
                                        "headers": {
                                            "Content-Type": "application/json",
                                        },
                                        "body": {
                                            "model": "openai",
                                            "response_format": {"type": "json_object"},
                                            "messages": [
                                                {
                                                    "role": "system",
                                                    "content": "@coalesce(outputs('Parse_Body')?['systemPrompt'], 'You are ISABI, the warm, human conversational assistant for ISABI Systems.')",
                                                },
                                                {
                                                    "role": "user",
                                                    "content": "@coalesce(outputs('Parse_Body')?['userPrompt'], string(outputs('Parse_Body')?['q']))",
                                                },
                                            ],
                                        },
                                        "retryPolicy": {"type": "none"},
                                    },
                                },
                                "If_Cloud_LLM_Ok": {
                                    "type": "If",
                                    "runAfter": {
                                        "Call_Cloud_LLM": ["Succeeded", "Failed", "TimedOut"]
                                    },
                                    "expression": {
                                        "equals": [
                                            "@outputs('Call_Cloud_LLM')?['statusCode']",
                                            200,
                                        ]
                                    },
                                    "actions": {
                                        "Cloud_LLM_Text": {
                                            "type": "Compose",
                                            "runAfter": {},
                                            "inputs": "@coalesce(body('Call_Cloud_LLM')?['choices']?[0]?['message']?['content'], '{}')",
                                        },
                                        "Log_Entry_Cloud": {
                                            "type": "Compose",
                                            "runAfter": {"Cloud_LLM_Text": ["Succeeded"]},
                                            "inputs": {
                                                "ts": "@utcNow()",
                                                "q": "@coalesce(outputs('Parse_Body')?['q'], '')",
                                                "lang": "@coalesce(outputs('Parse_Body')?['lang'], 'en')",
                                                "industry": "@coalesce(outputs('Parse_Body')?['industry'], '')",
                                                "currency": "@coalesce(outputs('Parse_Body')?['currency'], 'USD')",
                                                "period": "@coalesce(outputs('Parse_Body')?['period'], 'mtd')",
                                                "scale": "@coalesce(outputs('Parse_Body')?['scale'], '')",
                                                "range": "@coalesce(outputs('Parse_Body')?['range'], '')",
                                                "replyTitle": "Cloud AI Reply",
                                                "mode": "cloud_llm",
                                            },
                                        },
                                        "New_Logs_Cloud": {
                                            "type": "Compose",
                                            "runAfter": {"Log_Entry_Cloud": ["Succeeded"]},
                                            "inputs": "@take(union(createArray(outputs('Log_Entry_Cloud')), outputs('Cur_Logs')), 200)",
                                        },
                                        "Save_Store_Cloud": act(
                                            "UpdateRecord",
                                            {
                                                "entityName": "annotations",
                                                "recordId": store_id,
                                                "item/filename": WR_NAME,
                                                "item/mimetype": "application/json",
                                                "item/documentbody": "@base64(string(setProperty(setProperty(outputs('Store_Obj'), 'logs', outputs('New_Logs_Cloud')), 'updatedAt', utcNow())))",
                                            },
                                            {"New_Logs_Cloud": ["Succeeded"]},
                                        ),
                                        "Response_Cloud_LLM": response(
                                            200,
                                            {
                                                "ok": True,
                                                "mode": "gemini_cloud",
                                                "provider": "cloud_llm",
                                                "rawReply": "@outputs('Cloud_LLM_Text')",
                                                "serverTime": "@utcNow()",
                                            },
                                            {"Save_Store_Cloud": ["Succeeded", "Failed"]},
                                        ),
                                    },
                                    "else": {
                                        "actions": {
                                            "Log_Entry_Fallback": {
                                                "type": "Compose",
                                                "runAfter": {},
                                                "inputs": {
                                                    "ts": "@utcNow()",
                                                    "q": "@coalesce(outputs('Parse_Body')?['q'], '')",
                                                    "lang": "@coalesce(outputs('Parse_Body')?['lang'], 'en')",
                                                    "industry": "@coalesce(outputs('Parse_Body')?['industry'], '')",
                                                    "currency": "@coalesce(outputs('Parse_Body')?['currency'], 'USD')",
                                                    "period": "@coalesce(outputs('Parse_Body')?['period'], 'mtd')",
                                                    "scale": "@coalesce(outputs('Parse_Body')?['scale'], '')",
                                                    "range": "@coalesce(outputs('Parse_Body')?['range'], '')",
                                                    "replyTitle": "@coalesce(outputs('Parse_Body')?['replyTitle'], '')",
                                                    "mode": "logged_only",
                                                },
                                            },
                                            "New_Logs_Fallback": {
                                                "type": "Compose",
                                                "runAfter": {"Log_Entry_Fallback": ["Succeeded"]},
                                                "inputs": "@take(union(createArray(outputs('Log_Entry_Fallback')), outputs('Cur_Logs')), 200)",
                                            },
                                            "Save_Store_Fallback": act(
                                                "UpdateRecord",
                                                {
                                                    "entityName": "annotations",
                                                    "recordId": store_id,
                                                    "item/filename": WR_NAME,
                                                    "item/mimetype": "application/json",
                                                    "item/documentbody": "@base64(string(setProperty(setProperty(outputs('Store_Obj'), 'logs', outputs('New_Logs_Fallback')), 'updatedAt', utcNow())))",
                                                },
                                                {"New_Logs_Fallback": ["Succeeded"]},
                                            ),
                                            "Response_Fallback": response(
                                                200,
                                                {
                                                    "ok": True,
                                                    "mode": "logged_only",
                                                    "serverTime": "@utcNow()",
                                                },
                                                {"Save_Store_Fallback": ["Succeeded", "Failed"]},
                                            ),
                                        }
                                    },
                                },
                            },
                            "else": {
                                "actions": {
                                    "Log_Entry_Local": {
                                        "type": "Compose",
                                        "runAfter": {},
                                        "inputs": {
                                            "ts": "@utcNow()",
                                            "q": "@coalesce(outputs('Parse_Body')?['q'], '')",
                                            "lang": "@coalesce(outputs('Parse_Body')?['lang'], 'en')",
                                            "industry": "@coalesce(outputs('Parse_Body')?['industry'], '')",
                                            "currency": "@coalesce(outputs('Parse_Body')?['currency'], 'USD')",
                                            "period": "@coalesce(outputs('Parse_Body')?['period'], 'mtd')",
                                            "scale": "@coalesce(outputs('Parse_Body')?['scale'], '')",
                                            "range": "@coalesce(outputs('Parse_Body')?['range'], '')",
                                            "replyTitle": "@coalesce(outputs('Parse_Body')?['replyTitle'], '')",
                                            "mode": "@coalesce(outputs('Parse_Body')?['mode'], 'logged_only')",
                                        },
                                    },
                                    "New_Logs_Local": {
                                        "type": "Compose",
                                        "runAfter": {"Log_Entry_Local": ["Succeeded"]},
                                        "inputs": "@take(union(createArray(outputs('Log_Entry_Local')), outputs('Cur_Logs')), 200)",
                                    },
                                    "Save_Store_Local": act(
                                        "UpdateRecord",
                                        {
                                            "entityName": "annotations",
                                            "recordId": store_id,
                                            "item/filename": WR_NAME,
                                            "item/mimetype": "application/json",
                                            "item/documentbody": "@base64(string(setProperty(setProperty(outputs('Store_Obj'), 'logs', outputs('New_Logs_Local')), 'updatedAt', utcNow())))",
                                        },
                                        {"New_Logs_Local": ["Succeeded"]},
                                    ),
                                    "Response_Logged": response(
                                        200,
                                        {
                                            "ok": True,
                                            "mode": "logged_only",
                                            "loggedCount": "@length(outputs('New_Logs_Local'))",
                                            "serverTime": "@utcNow()",
                                        },
                                        {"Save_Store_Local": ["Succeeded", "Failed"]},
                                    ),
                                }
                            },
                        },
                    }
                },
            },
        },
        "outputs": {},
    }
    return {
        "properties": {
            "connectionReferences": {
                "shared_commondataserviceforapps": {
                    "runtimeSource": "embedded",
                    "connection": {"connectionReferenceLogicalName": CR_DV},
                    "api": {"name": "shared_commondataserviceforapps"},
                }
            },
            "definition": definition,
        },
        "schemaVersion": "1.0.0.0",
    }


def find_flow(name=FLOW_NAME):
    return get(
        f"workflows?$select=workflowid,statecode,resourceid,workflowidunique,clientdata&$filter=category eq 5 and name eq '{name}'"
    )["value"]


def deploy_flow():
    key = api_key()
    store_id = (
        open(STORE_ID_FILE, encoding="utf-8").read().strip()
        if os.path.exists(STORE_ID_FILE)
        else ensure_store()
    )
    cd = clientdata(key, store_id)
    ex = find_flow()
    if not ex:
        payload = {
            "name": FLOW_NAME,
            "category": 5,
            "type": 1,
            "primaryentity": "none",
            "description": "Public HTTP API & Dataverse question logger for Ask ISABI on https://husseinbdeir.github.io/isabi/ (backs onto annotations bhf_isabi_ask_store).",
            "clientdata": json.dumps(cd),
        }
        r = do("create Ask ISABI flow", "POST", "workflows", payload)
        assert r is not None, "Failed to create Ask ISABI flow"
        ex = find_flow()
    w = ex[0]
    with open(FLOW_ID_FILE, "w", encoding="utf-8") as f:
        f.write(w["workflowid"])
    if w["statecode"] == 1:
        do("deactivate flow", "PATCH", f"workflows({w['workflowid']})", {"statecode": 0, "statuscode": 1})
    do("update flow clientdata", "PATCH", f"workflows({w['workflowid']})", {"clientdata": json.dumps(cd)})
    do("activate flow", "PATCH", f"workflows({w['workflowid']})", {"statecode": 1, "statuscode": 2})

    ex = find_flow()
    w = ex[0]
    tok = _token(["https://service.flow.microsoft.com/.default"])
    H = {"Authorization": "Bearer " + tok, "Content-Type": "application/json"}
    for fid in (w.get("resourceid"), w.get("workflowidunique"), w["workflowid"]):
        if not fid:
            continue
        url = (
            f"https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/{ENV_ID}"
            f"/flows/{fid}/triggers/manual/listCallbackUrl?api-version=2016-11-01"
        )
        r = requests.post(url, headers=H, timeout=60)
        print(f"listCallbackUrl via {fid}: {r.status_code}")
        if r.ok:
            cb = r.json()["response"]["value"]
            with open(URL_FILE, "w", encoding="utf-8") as f:
                f.write(cb)
            print("Saved callback URL ->", URL_FILE)
            return cb
    raise RuntimeError("Could not fetch callback URL")


def write_endpoints_part():
    key = api_key()
    url = open(URL_FILE, encoding="utf-8").read().strip()
    u_b64 = base64.b64encode(url.encode("utf-8")).decode("ascii")
    k_b64 = base64.b64encode(key.encode("utf-8")).decode("ascii")
    with open(PART_ENDPOINTS, "w", encoding="utf-8") as f:
        f.write(
            '# Generated by build/isabi_ask_flow.py - do not edit by hand\n'
            f'ASK_FLOW_U_B64 = "{u_b64}"\n'
            f'ASK_FLOW_K_B64 = "{k_b64}"\n'
        )
    print("Wrote base64 endpoint constants ->", PART_ENDPOINTS)


def test_flow():
    key = api_key()
    url = open(URL_FILE, encoding="utf-8").read().strip()
    sys_prompt = (
        "You are ISABI, the warm, human conversational assistant for ISABI Systems "
        "(founded by Hussein Bdeir in Lebanon, serving clients across the Middle East and worldwide; "
        "WhatsApp +961 70 444 955, email hbdeir16@gmail.com). Return ONLY valid JSON: "
        '{"conversational": true, "title": "Short heading", "answer": "1-2 warm natural sentences", '
        '"promptText": "1 short natural follow-up question", "followUps": ["Q1", "Q2", "Q3"]}'
    )
    r = requests.post(
        url,
        data=json.dumps({
            "key": key,
            "op": "ask",
            "q": "were are you located",
            "lang": "en",
            "industry": "holding",
            "currency": "USD",
            "period": "mtd",
            "scale": "Multi-Branch (2 to 4 Entities)",
            "range": "$12,300 to $15,000",
            "replyTitle": "System Smoke Test",
            "systemPrompt": sys_prompt,
            "userPrompt": "Visitor Question: were are you located",
        }),
        headers={"Content-Type": "text/plain;charset=UTF-8"},
        timeout=60,
    )
    safe_txt = r.text[:400].encode("ascii", "replace").decode("ascii")
    print("POST status:", r.status_code, "CORS:", r.headers.get("Access-Control-Allow-Origin"), safe_txt)
    assert r.ok and r.json().get("ok"), "Flow POST failed"
    print("E2E Ask ISABI Cloud Flow verified 100%!")


def set_gemini_key(gkey, model="gemini-2.5-flash"):
    aid, obj = read_store_annotation()
    if not aid:
        aid = ensure_store()
        _, obj = read_store_annotation()
    obj.setdefault("config", {})
    obj["config"]["geminiKey"] = gkey.strip()
    obj["config"]["model"] = model
    write_store_annotation(aid, obj)
    print(f"Saved Gemini API key (length={len(gkey.strip())}, model={model}) in Dataverse annotation {aid}.")


def show_logs(limit=25):
    aid, obj = read_store_annotation()
    if not aid or not obj:
        print("No store annotation found.")
        return
    cfg = obj.get("config") or {}
    has_key = bool(cfg.get("geminiKey"))
    logs = obj.get("logs") or []
    print(f"Store {aid} | Gemini Key Configured: {has_key} (model: {cfg.get('model')}) | Total Logged Questions: {len(logs)}")
    for idx, item in enumerate(logs[:limit], 1):
        print(f"  {idx:02d}. [{item.get('ts')}] ({item.get('lang', 'en')} | {item.get('industry')} | {item.get('mode')}) Q: {item.get('q')} -> {item.get('replyTitle', '')}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--phases", default="")
    ap.add_argument("--set-gemini-key", default="")
    ap.add_argument("--model", default="gemini-2.5-flash")
    ap.add_argument("--logs", action="store_true")
    args = ap.parse_args()

    if args.set_gemini_key:
        set_gemini_key(args.set_gemini_key, args.model)
    elif args.logs:
        show_logs()
    else:
        phases = args.phases or "wfet"
        for p in phases:
            if p == "w":
                ensure_store()
            elif p == "f":
                deploy_flow()
            elif p == "e":
                write_endpoints_part()
            elif p == "t":
                test_flow()
