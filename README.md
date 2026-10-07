# League of Legends Widgets

MyWallpaper `canvas-v1` add-on, version 0.1.0. It has five selectable layouts: `rank` (default), `overview`, `session`, `rings` and `history`. The Riot product application [888917](https://developer.riotgames.com/app/888917/info) has a verified domain and is pending review. Production API and RSO access are not approved; no Riot credentials or real account linking are configured.

The widget can be distributed and installed as a visual prototype independently of its profile service. Without a linked profile or an available provider it shows a clear connection state, never fictional player statistics. Illustrative data is confined to the labelled developer preview and catalogue thumbnail. Publishing the widget does not activate the separate Riot service.

For the independent portal's setup and deployment requirements, see the [profile service guide](server/README.md).

## Development

```sh
pnpm install
pnpm build
pnpm test
```

The build checks types and creates `dist/assets/addon.js`, its styles and images. `mount()` uses the generated MyWallpaper SDK. Layout and appearance settings are native settings whose defaults come from the manifest. The widget does not capture pointer input (`pointerEvents: none`).

Run `pnpm preview` to serve the developer page at `http://127.0.0.1:5206/preview.html`. It mounts the production renderer with fictional data clearly labelled as a sample. It can show partial, expired, unlinked and unavailable states, plus unranked and Master+ LP values. It does not authenticate a player or contact Riot. `thumbnail.html` uses the same renderer in thumbnail mode; the catalog thumbnail is illustrative.

## Data and consent

For Riot-backed data, a player links their own account on the independent profile portal and explicitly consents to sharing, then pastes the resulting public profile URL into **Public profile URL**. The URL is a public share link: anyone who has it can read that profile snapshot until the owner withdraws consent. It is stored in this device's settings. The widget receives no Riot password, session cookie, OAuth token or API key. It fetches over HTTPS (HTTP is accepted only for loopback development), without cookies or redirects, with response-size and timeout limits. Polling pauses while the document is hidden.

When no public profile URL is set, the add-on can use the optional service provider `mywallpaper/league-player` (major version 1, alias `league`, topic `player`). This is an add-on-owned community contract; the MyWallpaper core has no Riot-specific or game-data knowledge.

Riot's League documentation does not impose a blanket RSO requirement on every public player-data lookup, unlike VALORANT's opt-in policy. This project still chooses a voluntary, owner-authorized and revocable profile-sharing flow. That choice does not claim that Riot requires RSO for every League integration. Any live production use needs Riot's approval and League credentials for this product and service, separate from VALORANT. See [Riot's League API documentation](https://developer.riotgames.com/docs/lol).

## Data limits

- Rank, LP, wins and losses come from the selected queue: Ranked Solo/Duo or Ranked Flex. Master, Grandmaster and Challenger have no division or 100-LP progress bar.
- History and its aggregates cover at most **10 completed ranked matches** in that queue; they are not career totals. Custom games and opponent or teammate records are not exposed.
- The service's remote spectator data can identify a current game, the player's champion and the game start time. It does not provide live K/D/A, CS, gold, items or in-game level, so those values remain `null`. The widget does not read game files, client credentials or a local game API.
- “No active game” does not mean online or offline. Unknown presence remains unknown.
- The service does not calculate LP change from a match or stale cache. Its value is `null`; the widget shows a change only when a configured provider supplies one.
- Expired snapshots are visibly marked as last-known data. Current presence and session details are suppressed while a snapshot is expired.

The snapshot contract and validation limits are defined in [src/contract.ts](src/contract.ts). Each snapshot has `schemaVersion: 1`, a state, millisecond Unix timestamps and an explicit consent flag. Missing values are `null`, history is limited to 10 rows, and withdrawal removes personal profile data from the snapshot. The service and add-on must use the same contract.

## License and publication

Original code is licensed under MIT ([LICENSE](LICENSE)). Riot artwork and game assets are excluded; see [NOTICE.md](NOTICE.md). Data Dragon metadata is pinned to version 16.20.1.

Before activating public Riot-backed data, obtain the required production API and RSO access and provide the actual service operator, privacy and terms information. Riot's approval and the rules applicable to the host product's monetization remain unresolved; this repository does not claim Riot approval.
