# Render Deployment

This backend is ready for Render as a Docker web service through the root
`render.yaml` blueprint.

## Deploy

1. Push the repository to GitHub.
2. In Render, create a new Blueprint and select this repository.
3. Render will create:
   - `didaskey-api` Docker web service
   - `didaskey-db` managed Postgres database
4. Fill the secret values Render asks for during blueprint creation.

## Required Secrets

Set these in the Render service environment:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `PAYSTACK_SECRET_KEY`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `R2_BUCKET`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

`SECRET_KEY` is generated automatically by Render.

## After Deploy

Use the Render service URL or your custom API domain as the mobile API URL:

```env
EXPO_PUBLIC_API_URL=https://your-render-service.onrender.com
```

For production, prefer a custom domain:

```env
EXPO_PUBLIC_API_URL=https://api.didaskey.com
```

Then rebuild the Expo app so testers receive the stable backend URL.

## Notes

- The Docker command runs `./scripts/start.sh`, which applies migrations before
  starting the API.
- The API listens on Render's `$PORT` automatically.
- Render's Postgres connection string is normalized to SQLAlchemy's asyncpg
  format by the backend settings layer.
