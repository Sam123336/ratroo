# Vercel deployment pipeline

The repository deploys pull requests to Vercel Preview and deploys `main` to
Vercel Production through `.github/workflows/vercel-deploy.yml`.

## One-time setup

1. Create or import the Ratroo web project in Vercel.
2. Add `RATROO_API_URL` to both Preview and Production environments. Use the
   backend base URL ending in `/v1`.
3. Add these GitHub Actions repository secrets:
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`
4. If Vercel's Git integration is also enabled, disable its automatic
   deployments to avoid duplicate deployments. The GitHub Actions pipeline is
   the deployment owner.

Vercel writes the organization and project IDs to `.vercel/project.json` after
`vercel link`; copy those values into the GitHub secrets. Do not commit the
`.vercel` directory or any token.

## Deployment behavior

- Pull request: builds and creates a Vercel Preview URL.
- Push to `main`: builds and deploys to Vercel Production.
- A newer commit cancels an older in-progress deployment for the same branch.

The default `npm run build` remains the Vinext/Sites build. Vercel uses the
separate `npm run build:vercel` command defined in `vercel.json`.
