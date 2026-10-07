# League of Legends profile service

This independent service owns the add-on's Riot integration, consent flow, sessions, public profile links, SQLite database and credentials. It does not use the MyWallpaper backend or a VALORANT service. A live deployment needs its own League production API key, RSO client, HTTPS origin and storage. None is configured here. The service is closed by default and is neither a general provider framework nor an arbitrary URL proxy.

## Local preparation

Use Node.js 22.22.3 or later within Node 22. From this directory:

```sh
cp .env.example .env
npm ci
npm test
npm start
```

The default origin is `http://127.0.0.1:5207`, with SQLite data under the ignored `data/` directory. `RIOT_LEAGUE_RSO_APPROVED` defaults to `false`, so the portal can be inspected but account linking and public profile reads stay disabled. The base Compose file uses the same closed setting. It maps the service to host loopback port 5207, runs read-only with dropped capabilities, and stores SQLite data in a named volume.

## Approval-gated configuration

The `compose.league.yaml` overlay is a configuration example, not an approval or deployment. Do not enable it until Riot approves the League product's production API access and RSO integration. Riot's League documentation says RSO access depends on an approved production application/key; this repository does not claim that approval or contain a real key or RSO client.

The overlay requires an HTTPS `PUBLIC_ORIGIN`, this service's `RIOT_LEAGUE_RSO_CLIENT_ID`, `OPERATOR_NAME`, `OPERATOR_CONTACT`, `PRIVACY_URL` and `TERMS_URL`. `RIOT_LEAGUE_REQUESTS_PER_MINUTE` and `MAX_PROFILES` are optional and default to 60 and 1000. Set the request budget within the actual League key's assigned limits.

Keep the two credential values in separate private, single-line files outside the repository: one League API key and one League RSO client secret. Set `RIOT_LEAGUE_API_KEY_FILE` and `RIOT_LEAGUE_RSO_CLIENT_SECRET_FILE` to those host file paths in an untracked `server/.env`. The overlay mounts them as Compose secrets at `/run/secrets/riot_league_api_key` and `/run/secrets/riot_league_client_secret`; it does not put the credential values in environment variables or the image. The RSO client ID is not a secret, but must be issued for this League integration and kept separate from the VALORANT service configuration.

After supplying the approved values and configuring an HTTPS reverse proxy for the dedicated League origin, the example can be started from this directory with:

```sh
docker compose --env-file .env -f compose.yaml -f compose.league.yaml up -d --build
```

Compose publishes the service only on host loopback; the overlay does not include a reverse proxy. A separately configured HTTPS frontend must forward to that loopback port and use the same public origin. The production overlay explicitly enables linking, and startup fails if its required credentials or legal/operator configuration are missing. Do not commit `.env`, secret files or the SQLite volume.

## Account linking and consent

Players choose a supported game platform and either Ranked Solo/Duo (queue 420) or Ranked Flex (queue 440). Linking is a voluntary, owner-controlled RSO flow using PKCE, one-time state, a nonce and signed ID-token checks. The server then calls Riot Account-V1 `accounts/me` with the access token to obtain the owner's Riot ID and PUUID. OAuth tokens are discarded; they are not stored or returned to the browser.

Riot's public League APIs do not impose a blanket RSO requirement on every public player-data lookup. This service still requires its own opt-in account link as a product consent choice. Riot's [League API and RSO documentation](https://developer.riotgames.com/docs/lol) describes the current API, routing and approval requirements.

The public profile URL is a share link: anyone who has it can read the limited snapshot while consent remains active. Keep it private and revoke it in the portal if it is exposed. The private SQLite database stores the PUUID, Riot ID, selected platform and queue while consent is active. Withdrawal deletes the profile row, invalidates its public URL and session, clears adapter and HTTP caches, and prevents an in-flight refresh from restoring the data. Minimal consent receipts contain a random profile ID, event, consent version and timestamp; after profile deletion they are retained for 30 days. Access and ID tokens, request bodies and client IP addresses are not written to the database.

## Data returned

The public snapshot follows the add-on's `PlayerSnapshot` contract. It contains the owner's Riot ID and platform; rank, wins and losses for the selected queue; recent-match aggregates for at most 10 completed ranked matches in that queue; and up to 10 owner-only match summaries. Match-V5 queries filter by queue and each result is checked against that queue. Opponent and teammate records are not copied into the public snapshot.

League-V4 rank is read by PUUID. An absent queue entry is returned as unranked with null LP; Master, Grandmaster and Challenger have no division, and their LP is reported without a 100-LP threshold. LP change is always null because the service does not have a verified per-game change value. Recent-match aggregates are not career statistics and are separate from the current ranked entry.

Spectator-V5 is queried when a public profile is requested, no more often than once per minute per profile. It provides the owner's champion and game start time; live K/D/A, CS, gold, items and in-game level are null because the endpoint does not supply them. A spectator 404 means no current game was found and maps to `not-playing`; other spectator failures map to unknown presence and a null session while cached rank and history remain usable. Champion and item artwork is resolved by the add-on from its pinned Data Dragon metadata; the service emits IDs, not asset URLs.

Rank, summoner details and recent history are cached for five minutes; current-game data has a 60-second cache. Refreshes are request-driven. Outbound Riot calls share one serialized per-instance budget configured by `RIOT_LEAGUE_REQUESTS_PER_MINUTE`, with a bounded queue and upstream 429 backoff. Profiles refresh only when requested, so a deployment with many active public profiles may need a lower profile limit or a larger approved key budget.

## Platform routing

Platform-routed Summoner-V4, League-V4 and Spectator-V5 calls use a fixed server-side host map. Account-V1 uses its documented Americas, Europe or Asia cluster. Match-V5 calls use the fixed Americas, Asia, Europe or SEA routing values; the browser cannot provide a host or URL.

The portal currently accepts BR1, EUN1, EUW1, JP1, KR, LA1, LA2, NA1, OC1, ME1, RU, SG2, TR1, TW2 and VN2. PH2 and TH2 remain in the add-on's shared contract but are intentionally unavailable in this service until their Match-V5 regional host mapping is verified. See Riot's [API routing values](https://developer.riotgames.com/docs/lol#routing-values).

Official operation references: [Summoner-V4 by PUUID](https://developer.riotgames.com/apis#summoner-v4/GET_getByPUUID), [League-V4 entries by PUUID](https://developer.riotgames.com/apis#league-v4/GET_getLeagueEntriesByPUUID), [Match-V5 match IDs](https://developer.riotgames.com/apis#match-v5/GET_getMatchIdsByPUUID), [Match-V5 match details](https://developer.riotgames.com/apis#match-v5/GET_getMatch), and [Spectator-V5 current game by PUUID](https://developer.riotgames.com/apis#spectator-v5/GET_getCurrentGameInfoByPuuid).
