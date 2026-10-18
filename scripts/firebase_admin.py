#!/usr/bin/env python3
"""One-off Firebase setup with a service-account key (kept OUTSIDE the repo).

  python3 scripts/firebase_admin.py KEY.json deploy-rules        publish firestore.rules
  python3 scripts/firebase_admin.py KEY.json add-owner +91XXXXXXXXXX   let that mobile number use /admin
                                                                     (creates the phone sign-in user if needed)

Needs: pip install google-auth requests. The key is never printed or stored."""
import pathlib, sys
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession

key, cmd = sys.argv[1], sys.argv[2]
creds = service_account.Credentials.from_service_account_file(key, scopes=[
    'https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase'])
project = creds.project_id
S = AuthorizedSession(creds)
root = pathlib.Path(__file__).resolve().parent.parent

if cmd == 'deploy-rules':
    src = (root / 'firestore.rules').read_text()
    r = S.post(f'https://firebaserules.googleapis.com/v1/projects/{project}/rulesets',
               json={'source': {'files': [{'name': 'firestore.rules', 'content': src}]}})
    r.raise_for_status()
    ruleset = r.json()['name']
    name = f'projects/{project}/releases/cloud.firestore'
    # Creating the database makes a default release, so update it; create one only if it is missing
    r = S.patch(f'https://firebaserules.googleapis.com/v1/{name}', json={'release': {'name': name, 'rulesetName': ruleset}})
    if r.status_code == 404:
        r = S.post(f'https://firebaserules.googleapis.com/v1/projects/{project}/releases', json={'name': name, 'rulesetName': ruleset})
    r.raise_for_status()
    print('rules published:', ruleset)

elif cmd == 'add-owner':
    phone = sys.argv[3].replace(' ', '')
    if not phone.startswith('+'):
        phone = '+91' + phone.lstrip('0')
    base = f'https://identitytoolkit.googleapis.com/v1/projects/{project}/accounts'
    r = S.post(base + ':lookup', json={'phoneNumber': [phone]})
    r.raise_for_status()
    users = r.json().get('users') or []
    if users:
        uid = users[0]['localId']
    else:
        r = S.post(base, json={'phoneNumber': phone})   # creates the phone sign-in user
        r.raise_for_status()
        uid = r.json()['localId']
    r = S.patch(f'https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents/admins/{uid}',
                json={'fields': {'phone': {'stringValue': phone}}})
    r.raise_for_status()
    print(f'owner added: {phone} ({uid})')
else:
    sys.exit(__doc__)
