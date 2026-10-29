# JobSync — Frontend

This folder is a thin **npm wrapper** so you can run the SPA without remembering the `client/`
sub-path. The actual application lives in [`client/`](./client/README.md).

```
frontend/
├── package.json     ← wrapper: every script delegates to client/
└── client/          ← React 19 + Vite SPA (all source lives here)
```

| Command (run inside `frontend/`) | Delegates to                                          |
| -------------------------------- | ----------------------------------------------------- |
| `npm run dev`                    | `npm --prefix client run dev` → http://localhost:5173 |
| `npm run build`                  | `npm --prefix client run build` → `client/dist`       |
| `npm run preview`                | `npm --prefix client run preview`                     |
| `npm run lint`                   | `npm --prefix client run lint`                        |

The wrapper has **no dependencies of its own** — `npm install` here does nothing useful. Install
inside `client/` first:

```powershell
cd frontend/client
npm install
npm run dev
```

> Either path works: `cd frontend && npm install --prefix client && npm run dev`, or
> `cd frontend/client && npm install && npm run dev`. Use one consistently so you only have one
> `node_modules`.

## What this SPA talks to

- Backend: `http://localhost:5000` (see [`../backend/README.md`](../backend/README.md))
- Transport: `axios` with `baseURL: "/api"` and `withCredentials: true`; Vite proxies `/api` to the
  backend in development, so auth cookies are same-origin and CORS is a non-issue locally.
- Auth: httpOnly cookie only — the SPA never reads or stores a token.

For full details — routes, role-scoped navigation, data flow, design system and export pipeline —
read [`client/README.md`](./client/README.md).
