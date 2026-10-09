#!/usr/bin/env python3
"""Render a NEW private configuration directory; never installs or starts it."""
import argparse, base64, hashlib, hmac, json, os, pathlib, re, secrets, time
from urllib.parse import urlsplit

HERE=pathlib.Path(__file__).resolve().parent

def validate(c):
 for name in ['self_registration', 'hybrid_self_registration', 'knowledge_enabled']:
  c.setdefault(name, False)
 c.setdefault('denied_emails', [])
 for name in ['origin','access_issuer']:
  u=urlsplit(c[name])
  if u.scheme!='https' or not u.hostname or not re.fullmatch(r'[A-Za-z0-9.-]+',u.hostname) or u.port not in (None,443) or u.username or u.password or u.query or u.fragment or u.path not in ('','/'):
   raise ValueError(name+' must be an HTTPS origin')
  c[name]=c[name].rstrip('/')
 if 'REPLACE' in c['access_issuer'] or 'REPLACE' in c['access_audience'] or not re.fullmatch(r'[A-Za-z0-9_-]{16,256}',c['access_audience']):
  raise ValueError('Supply your own Access issuer and audience')
 for name in ['release_dir','config_dir','state_dir','runtime_dir','model_file','nginx','python']:
  if not re.fullmatch(r'/[A-Za-z0-9_./-]+',c[name]) or '..' in pathlib.Path(c[name]).parts or c[name]=='/':
   raise ValueError(name+' requires an absolute path without whitespace or parent traversal')
 if not re.fullmatch(r'[a-z][a-z0-9-]{1,15}',c['service_prefix']):raise ValueError('Invalid service prefix')
 for name in ['external_enabled','self_registration','hybrid_self_registration','knowledge_enabled']:
  if not isinstance(c[name],bool):raise ValueError(name+' must be boolean')
 for name in ['allowed_emails','denied_emails']:
  if not isinstance(c[name],list) or any(not isinstance(e,str) or not re.fullmatch(r'[A-Za-z0-9_.+%-]+@[A-Za-z0-9.-]+',e) or e.startswith('replace-') for e in c[name]):
   raise ValueError('Supply valid email addresses in '+name)
 if not c['self_registration'] and not c['allowed_emails']:
  raise ValueError('Closed mode requires explicit allowed email addresses')
 roots=[pathlib.Path(c[name]) for name in ['release_dir','config_dir','state_dir']]
 if any(left.is_relative_to(right) or right.is_relative_to(left) for i,left in enumerate(roots) for right in roots[i+1:]):
  raise ValueError('Keep release, configuration and state as separate non-nested directories')
 return c

def render(c,out):
 c=validate(dict(c)); out.mkdir(mode=0o700,parents=True,exist_ok=False)
 for name in ['private','shared','public','units']:(out/name).mkdir(mode=0o700)
 def write(name,text,mode=0o600):
  p=out/name;p.write_text(text);p.chmod(mode)
 def envfile(name,values):
  for value in values.values():
   if '\n' in str(value) or '\r' in str(value):raise ValueError('Newlines in configuration refused')
  write('private/'+name,''.join(f'{k}={v}\n' for k,v in values.items()))
 cfg=c['config_dir']; state=c['state_dir']; release=c['release_dir']; prefix=c['service_prefix']; rt=c['runtime_dir']
 node=rt+'/node-v22.23.3-linux-x64/bin/node'; docker=rt+'/docker/docker'; socket='/run/'+prefix+'-docker.sock'
 secret={k:secrets.token_hex(32) for k in ['db_password','jwt_secret','download_secret','user_keys_secret']}
 def jwt(role):
  enc=lambda v:base64.urlsafe_b64encode(json.dumps(v,separators=(',',':')).encode()).rstrip(b'=')
  data=enc({'alg':'HS256','typ':'JWT'})+b'.'+enc({'iss':'courtos','role':role,'iat':int(time.time()),'exp':int(time.time())+315360000})
  return (data+b'.'+base64.urlsafe_b64encode(hmac.new(secret['jwt_secret'].encode(),data,hashlib.sha256).digest()).rstrip(b'=')).decode()
 write('private/operator.json',json.dumps(c,indent=2)+'\n')
 write('private/secrets.json',json.dumps(secret)+'\n')
 write('shared/packet-hmac',secrets.token_hex(48)+'\n',0o640)
 write('private/gateway-provider.env','# Set only for an explicitly enabled external gateway. Never copy a production key.\nANTHROPIC_API_KEY=\n')
 write('private/roles.sql',"alter role supabase_auth_admin with login password '"+secret['db_password']+"';\nalter role authenticator with login password '"+secret['db_password']+"';\n",0o644)
 envfile('db.env',{'POSTGRES_PASSWORD':secret['db_password'],'POSTGRES_DB':'postgres','JWT_SECRET':secret['jwt_secret'],'JWT_EXP':'3600'})
 envfile('auth.env',{'GOTRUE_API_HOST':'127.0.0.1','GOTRUE_API_PORT':'18193','API_EXTERNAL_URL':'http://127.0.0.1:18192','GOTRUE_DB_DRIVER':'postgres','GOTRUE_DB_DATABASE_URL':f"postgres://supabase_auth_admin:{secret['db_password']}@127.0.0.1:18195/postgres",'GOTRUE_SITE_URL':c['origin'],'GOTRUE_URI_ALLOW_LIST':c['origin']+'/**','GOTRUE_JWT_SECRET':secret['jwt_secret'],'GOTRUE_JWT_EXP':'3600','GOTRUE_JWT_AUD':'authenticated','GOTRUE_JWT_DEFAULT_GROUP_NAME':'authenticated','GOTRUE_JWT_ADMIN_ROLES':'service_role','GOTRUE_DISABLE_SIGNUP':'true','GOTRUE_EXTERNAL_EMAIL_ENABLED':'true','GOTRUE_EXTERNAL_PHONE_ENABLED':'false','GOTRUE_EXTERNAL_GOOGLE_ENABLED':'false','GOTRUE_MAILER_AUTOCONFIRM':'false','GOTRUE_LOG_LEVEL':'warn'})
 envfile('rest.env',{'PGRST_DB_URI':f"postgres://authenticator:{secret['db_password']}@127.0.0.1:18195/postgres",'PGRST_DB_SCHEMAS':'public','PGRST_DB_ANON_ROLE':'anon','PGRST_JWT_SECRET':secret['jwt_secret'],'PGRST_SERVER_HOST':'127.0.0.1','PGRST_SERVER_PORT':'18194','PGRST_LOG_LEVEL':'warn'})
 envfile('backend.env',{'NODE_ENV':'production','HOST':'127.0.0.1','PORT':'18191','FRONTEND_URL':c['origin'],'API_PUBLIC_URL':c['origin']+'/api','BACKEND_PUBLIC_URL':c['origin']+'/api','SUPABASE_URL':'http://127.0.0.1:18192','SUPABASE_PUBLISHABLE_KEY':jwt('anon'),'SUPABASE_SECRET_KEY':jwt('service_role'),'STORAGE_DRIVER':'fs','STORAGE_FS_ROOT':state+'/files','DOWNLOAD_SIGNING_SECRET':secret['download_secret'],'USER_API_KEYS_ENCRYPTION_SECRET':secret['user_keys_secret'],'COURTOS_PILOT_MODE':'true','COURTOS_PILOT_MODEL_ID':'courtos-local','COURTOS_PILOT_MODEL_NAME':'gemma-4-12b-qat','COURTOS_PILOT_MODEL_URL':'http://127.0.0.1:18181/v1','COURTOS_AUTH_MODE':'cloudflare','COURTOS_ACCESS_ISSUER':c['access_issuer'],'COURTOS_ACCESS_AUDIENCE':c['access_audience'],'COURTOS_ACCESS_JWKS_FILE':cfg+'/public/access-jwks.json','COURTOS_ACCESS_EMAILS':','.join(c['allowed_emails']),'COURTOS_ACCESS_SELF_REGISTRATION':str(c['self_registration']).lower(),'COURTOS_KNOWLEDGE_ENABLED':str(c['knowledge_enabled']).lower(),'COURTOS_ACCESS_DENY_EMAILS':','.join(c['denied_emails']),'SENTRY_DISABLED':'true','SENTRY_INSTALL':'false','MIKE_RAW_STREAM_LOG_ENABLED':'false','WORKERS_MODE':'thread','UPLOAD_PROCESSING_CONCURRENCY':'1','UPLOAD_PROCESSING_MAX_RUNNING_PER_USER':'1','COURTOS_UPLOAD_MAX_FILE_BYTES':'5242880','COURTOS_UPLOAD_MAX_BATCH_FILES':'5','COURTOS_UPLOAD_USER_TOTAL_BYTES':'20971520','COURTOS_UPLOAD_GLOBAL_TOTAL_BYTES':'524288000','STREAM_FIRST_CHUNK_TIMEOUT_MS':'600000','STREAM_CHUNK_TIMEOUT_MS':'120000'})
 envfile('frontend.env',{'NODE_ENV':'production','API_BASE_URL':'http://127.0.0.1:18191','NEXT_PUBLIC_COURTOS_PILOT_MODE':'true','NEXT_PUBLIC_COURTOS_AUTH_MODE':'cloudflare','NEXT_PUBLIC_COURTOS_ACCESS_SELF_REGISTRATION':str(c['self_registration']).lower(),'NEXT_PUBLIC_COURTOS_KNOWLEDGE_ENABLED':str(c['knowledge_enabled']).lower(),'SENTRY_DISABLED':'true','SENTRY_INSTALL':'false','NEXT_PUBLIC_SENTRY_DISABLED':'true','NEXT_PUBLIC_SENTRY_INSTALL':'false','NEXT_TELEMETRY_DISABLED':'1'})
 envfile('hybrid.env',{'APP_DB':state+'/hybrid/app.sqlite','DEMO_DATA':release+'/hybrid/data/demo.json','HMAC_SECRET_FILE':cfg+'/shared/packet-hmac','APP_ORIGIN':c['origin'],'BASE_PATH':'/hybrid','AUTH_MODE':'cloudflare','OCL_ACCESS_SELF_REGISTRATION':str(c['hybrid_self_registration']).lower(),'ACCESS_ISSUER':c['access_issuer'],'ACCESS_AUD':c['access_audience'],'ACCESS_JWKS_FILE':cfg+'/public/access-jwks.json','LOCAL_MODEL_URL':'http://127.0.0.1:18181/v1/chat/completions','LOCAL_MODEL_NAME':'gemma-4-12b-qat','LOCAL_TIMEOUT_SECONDS':'600','GATEWAY_URL':'http://127.0.0.1:18182','EXTERNAL_MODEL':'claude-sonnet-4-6','EXTERNAL_ENABLED':'true' if c['external_enabled'] else 'false','LOCATION':'Separate VPS in Germany; synthetic pilot'})
 envfile('gateway.env',{'GATEWAY_DB':state+'/gateway/gateway.sqlite','HMAC_SECRET_FILE':cfg+'/shared/packet-hmac','PUBLIC_CATALOG':release+'/hybrid/data/public-catalog.json','EXTERNAL_MODEL':'claude-sonnet-4-6'})
 common='''Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectProc=invisible
'''
 def unit(suffix,description,user,workdir,command,extra='',envs=(),network=True):
  text=f'[Unit]\nDescription={description}\nAfter=network.target\n[Service]\nUser={user}\nGroup={user}\nWorkingDirectory={workdir}\n'
  text+=''.join('EnvironmentFile='+cfg+'/private/'+e+'\n' for e in envs)
  text+=f'ExecStart={command}\n'+common+extra
  if network:text+='IPAddressDeny=any\nIPAddressAllow=localhost\n'
  text+='[Install]\nWantedBy=multi-user.target\n'
  write('units/'+prefix+'-'+suffix+'.service',text,0o644)
 private='InaccessiblePaths='+cfg+'/private\n'
 unit('backend','CourtOS private document API',prefix,release+'/backend',node+' dist/index.js',f'Environment=PATH={rt}/node-v22.23.3-linux-x64/bin:/usr/bin:/bin\nReadWritePaths={state}/files\nInaccessiblePaths={state}/hybrid {state}/gateway {state}/postgres {cfg}/private {cfg}/shared\nMemoryMax=2G\nCPUQuota=200%\nTasksMax=128\n',('backend.env',))
 unit('frontend','CourtOS browser application',prefix+'-web',release+'/frontend',node+' node_modules/next/dist/bin/next start -H 127.0.0.1 -p 18190',f'InaccessiblePaths={state} {cfg}/private {cfg}/shared\nMemoryMax=1536M\nCPUQuota=150%\nTasksMax=128\n',('frontend.env',))
 unit('hybrid','CourtOS separate synthetic hybrid app',prefix+'-app',release+'/hybrid',release+'/hybrid/.venv/bin/uvicorn backend:app --host 127.0.0.1 --port 18180 --workers 1 --no-access-log',f'SupplementaryGroups={prefix}-packet\nEnvironment=PYTHONDONTWRITEBYTECODE=1\nReadWritePaths={state}/hybrid\nInaccessiblePaths={state}/files {state}/gateway {state}/postgres {cfg}/private\nMemoryMax=512M\nCPUQuota=100%\nTasksMax=64\n',('hybrid.env',))
 unit('gateway','CourtOS approved public packet gateway',prefix+'-gate',release+'/hybrid',release+'/hybrid/.venv/bin/uvicorn gateway:app --host 127.0.0.1 --port 18182 --workers 1 --no-access-log',f'SupplementaryGroups={prefix}-packet\nEnvironment=PYTHONDONTWRITEBYTECODE=1\nReadWritePaths={state}/gateway\nInaccessiblePaths={state}/files {state}/hybrid {state}/postgres {release}/hybrid/data/demo.json {cfg}/private\nMemoryMax=256M\nCPUQuota=100%\nTasksMax=64\n',('gateway.env','gateway-provider.env'),network=False)
 model_command=rt+'/llama-b11429/llama-server --model '+c['model_file']+' --alias gemma-4-12b-qat --host 127.0.0.1 --port 18181 --ctx-size 8192 --parallel 1 --threads 6 --threads-batch 6 --threads-http 2 --batch-size 512 --ubatch-size 128 --device none --gpu-layers 0 --fit off --offline --no-webui --no-agent --no-ui-mcp-proxy --no-slots --no-cache-prompt --reasoning off --log-disable'
 unit('model','CourtOS CPU model endpoint',prefix+'-model',rt,model_command,f'InaccessiblePaths={state} {cfg}/private {cfg}/shared\nEnvironment=LD_LIBRARY_PATH={rt}/llama-b11429\nMemoryMax=16G\nCPUQuota=600%\nNice=10\nStandardOutput=null\nStandardError=null\n')
 unit('proxy','CourtOS private HTTP proxy',prefix+'-proxy',release,c['nginx']+' -c '+cfg+'/public/nginx.conf -g "daemon off;"',f'RuntimeDirectory={prefix}-proxy\nReadWritePaths=/run/{prefix}-proxy\n'+private+'MemoryMax=128M\nCPUQuota=50%\n')
 write('units/'+prefix+'-containers.service',f'''[Unit]
Description=CourtOS dedicated data-service Docker daemon
After=network-online.target
Wants=network-online.target
[Service]
Type=notify
Environment=PATH={rt}/docker:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart={rt}/docker/dockerd --host=unix://{socket} --data-root={state}/docker --exec-root=/run/{prefix}-docker --pidfile=/run/{prefix}-docker.pid --bridge=none --iptables=false --ip6tables=false --ip-forward=false --ip-masq=false --log-driver=local --log-opt=max-size=10m --log-opt=max-file=2
Restart=on-failure
RestartSec=5
Delegate=yes
KillMode=process
LimitNOFILE=1048576
TasksMax=infinity
[Install]
WantedBy=multi-user.target
''',0o644)
 write('units/'+prefix+'-access-jwks.service',f'''[Unit]
Description=Refresh validated public Access verification keys
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
ExecStart={c['python']} {release}/ops/courtos/native/refresh-access-jwks.py --issuer {c['access_issuer']} --destination {cfg}/public/access-jwks.json
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths={cfg}/public
''',0o644)
 write('units/'+prefix+'-access-jwks.timer',f'''[Unit]
Description=Refresh CourtOS Access keys periodically
[Timer]
OnBootSec=1min
OnUnitActiveSec=1h
RandomizedDelaySec=5min
Persistent=true
[Install]
WantedBy=timers.target
''',0o644)
 domain=urlsplit(c['origin']).hostname
 write('public/nginx.conf',f'''pid /run/{prefix}-proxy/nginx.pid;
error_log stderr warn;
worker_processes 1;
events {{ worker_connections 512; }}
http {{
 include /etc/nginx/mime.types;
 default_type application/octet-stream;
 access_log off;
 server_tokens off;
 client_body_temp_path /run/{prefix}-proxy/client;
 proxy_temp_path /run/{prefix}-proxy/proxy;
 client_max_body_size 12m;
 proxy_http_version 1.1;
 proxy_set_header Host $host;
 proxy_set_header X-Forwarded-Proto https;
 proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
 proxy_buffering off;
 proxy_read_timeout 660s;
 proxy_send_timeout 660s;
 server {{
  listen 127.0.0.1:18189;
  server_name {domain};
  add_header Referrer-Policy no-referrer always;
  location = / {{ return 302 /pilot; }}
  location = /hybrid {{ return 302 /hybrid/; }}
  location /hybrid/ {{ proxy_pass http://127.0.0.1:18180/; }}
  location /guide/ {{ alias {release}/docs/guide/output/; index index.html; }}
  location / {{ proxy_pass http://127.0.0.1:18190; }}
 }}
 server {{
  listen 127.0.0.1:18192;
  server_name localhost;
  location /auth/v1/ {{ proxy_pass http://127.0.0.1:18193/; }}
  location /rest/v1/ {{ proxy_pass http://127.0.0.1:18194/; }}
  location / {{ return 404; }}
 }}
}}
''',0o644)
 print('Rendered private configuration and public unit templates; no services started. Protect this output directory.')

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('operator_json',type=pathlib.Path);parser.add_argument('output_dir',type=pathlib.Path)
 args=parser.parse_args();render(json.loads(args.operator_json.read_text()),args.output_dir)
