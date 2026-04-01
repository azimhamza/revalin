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
- `STORE_CURRENCY_BY_COUNTRY` (optional country mapping, e.g. `CA:CAD,US:USD,GB:GBP`)
- `SWELL_MANUAL_PAYMENT_METHOD` (manual payment method ID configured in Swell Payment Settings for NOWPayments sync; defaults to `crypto`)
- `NOW_PRIVATE_KEY` or `NOWPAYMENTS_API_KEY` (NOWPayments server API key; `NOW_PRIVATE_KEY` is accepted as an alias)
- `NOW_PUBLIC_KEY` or `NOWPAYMENTS_IPN_SECRET` (NOWPayments webhook signing secret; `NOW_PUBLIC_KEY` is accepted as an alias)
- `NEXT_PUBLIC_NOWPAYMENTS_QUICK_CURRENCIES` (optional comma-separated checkout currency chips, e.g. `btc,eth,sol,ltc,usdttrc20,trx`)
- `CHECKOUT_ORDER_STORAGE_PATH` (optional path for persisting checkout order snapshots outside the default local store)
- `SHIPPO_API_TOKEN` (optional; enables live Shippo rate quotes before order creation)
- `SHIPPO_ORIGIN_STREET1`, `SHIPPO_ORIGIN_ZIP` (required to activate Shippo live rates)
- `SHIPPO_ORIGIN_CITY`, `SHIPPO_ORIGIN_STATE`, `SHIPPO_ORIGIN_COUNTRY`, `SHIPPO_ORIGIN_NAME` (optional origin fields; defaults assume Waterloo, ON, CA)
- `SHIPPO_PARCEL_LENGTH_IN`, `SHIPPO_PARCEL_WIDTH_IN`, `SHIPPO_PARCEL_HEIGHT_IN`, `SHIPPO_DEFAULT_ITEM_WEIGHT_OZ` (optional parcel defaults for small-vial shipments)

## Checkout requirements

The native `/checkout` flow creates real Swell guest accounts, quotes shipping, creates a real Swell order, then
creates a NOWPayments payment for that Swell order total. For that flow to work:

- `SWELL_SECRET_KEY` must be present
- `SWELL_MANUAL_PAYMENT_METHOD` must match a manual payment method configured in your Swell dashboard
- Either Swell shipping services must be configured, or Shippo must be configured with a token plus origin street/postal code

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
