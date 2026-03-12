# Swell Headless Storefront

*Automatically synced with your [v0.app](https://v0.app) deployments*

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com)
[![Built with v0](https://img.shields.io/badge/Built%20with-v0.app-black?style=for-the-badge)](https://v0.app/chat/projects/PRfRz1Lck6u)

## Overview

This storefront uses Swell's Frontend API for products and categories.
The adapter keeps your existing UI contracts intact while replacing the legacy WordPress/WooCommerce backend dependency.

## Required environment variables

- `SWELL_STORE_ID` (or `NEXT_PUBLIC_SWELL_STORE_URL`)
- `SWELL_PUBLIC_KEY`

## Optional environment variables

- `SWELL_SECRET_KEY` (recommended for full Backend API access, including expanded stock/category data)
- `NEXT_PUBLIC_SWELL_STORE_URL` (if you prefer URL over store ID)
- `SWELL_API_URL` (advanced: set explicit API base if your store uses a non-standard API host)
- `NEXT_PUBLIC_SWELL_PUBLIC_KEY`
- `NEXT_PUBLIC_SWELL_CHECKOUT_URL`
- `NEXT_PUBLIC_STORE_CURRENCY` (defaults to `USD`)

## Deployment

Your project is live at:

Configured in your Vercel project settings.

## Build your app

Continue building your app on:

**[https://v0.app/chat/projects/PRfRz1Lck6u](https://v0.app/chat/projects/PRfRz1Lck6u)**

## How It Works

1. Create and modify your project using [v0.app](https://v0.app)
2. Deploy your chats from the v0 interface
3. Changes are automatically pushed to this repository
4. Vercel deploys the latest version from this repository

# revalin
