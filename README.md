# Swell Headless Storefront

_Automatically synced with your [v0.app](https://v0.app) deployments_

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
- `SHIPENGINE_API_KEY` (optional; enables live ShipEngine rates and automatic label purchase after payment)
- `SHIPENGINE_ORIGIN_STREET1`, `SHIPENGINE_ORIGIN_ZIP` (required to activate ShipEngine live rates / labels)
- `SHIPENGINE_ORIGIN_CITY`, `SHIPENGINE_ORIGIN_STATE`, `SHIPENGINE_ORIGIN_COUNTRY`, `SHIPENGINE_ORIGIN_NAME`, `SHIPENGINE_ORIGIN_PHONE` (optional origin fields used for rating and labels)
- `SHIPENGINE_CARRIER_IDS` (optional comma-separated carrier IDs; otherwise carriers are auto-discovered)
- `SHIPENGINE_PARCEL_LENGTH_IN`, `SHIPENGINE_PARCEL_WIDTH_IN`, `SHIPENGINE_PARCEL_HEIGHT_IN`, `SHIPENGINE_DEFAULT_ITEM_WEIGHT_OZ` (optional parcel defaults for small-vial shipments)
- `SHIPPO_API_TOKEN` (optional; enables live Shippo rate quotes before order creation)
- `SHIPPO_ORIGIN_STREET1`, `SHIPPO_ORIGIN_ZIP` (required to activate Shippo live rates)
- `SHIPPO_ORIGIN_CITY`, `SHIPPO_ORIGIN_STATE`, `SHIPPO_ORIGIN_COUNTRY`, `SHIPPO_ORIGIN_NAME` (optional origin fields; defaults assume Waterloo, ON, CA)
- `SHIPPO_PARCEL_LENGTH_IN`, `SHIPPO_PARCEL_WIDTH_IN`, `SHIPPO_PARCEL_HEIGHT_IN`, `SHIPPO_DEFAULT_ITEM_WEIGHT_OZ` (optional parcel defaults for small-vial shipments)
- `LOOPS_API_KEY` (optional; enables Loops events + transactional emails)
- `LOOPS_TRANSACTIONAL_ORDER_CONFIRMATION` (optional Loops template ID for customer order confirmation)
- `LOOPS_TRANSACTIONAL_ORDER_SHIPPED` (optional Loops template ID for customer shipped notification)
- `LOOPS_TRANSACTIONAL_BACK_IN_STOCK` (optional Loops template ID for customer restock notifications)
- `LOOPS_TRANSACTIONAL_SHIPPING_LABEL` (optional Loops template ID for the internal shipping-label email with a label URL)
- `LOOPS_TRANSACTIONAL_EMAIL_VERIFICATION` (optional Loops template ID for 6-digit email verification codes)
- `LOOPS_TRANSACTIONAL_PASSWORD_RESET` (optional Loops template ID for 6-digit password reset codes; falls back to `LOOPS_TRANSACTIONAL_EMAIL_VERIFICATION`)
- `LOOPS_TRANSACTIONAL_WELCOME_DISCOUNT_ISSUED` (optional Loops template ID for internal welcome-discount notifications; defaults to `cmnny5qyb07uw0iygc80j82d2`)
- `LOOPS_TRANSACTIONAL_PRODUCT_NOTIFICATION_SIGNUP` (optional Loops template ID for customer restock-signup confirmation emails)
- `LOOPS_WELCOME_DISCOUNT_CODE_PROPERTY_KEY` (optional Loops contact property API key for storing the issued welcome code; defaults to `initCode`)
- `LOOPS_WELCOME_DISCOUNT_USED_PROPERTY_KEY` (optional Loops contact property API key for marking welcome-code redemption; defaults to `initCodeUsed`)
- `LOOPS_TRANSACTIONAL_AFFILIATE_APPROVED` (optional Loops template ID for first-time Growth Partner approval)
- `LOOPS_TRANSACTIONAL_AFFILIATE_APPLICATION_RECEIVED` (optional Loops template ID for internal Growth Partner application notifications; defaults to `cmnmb8o0s00b40iuq46qek8jv`)
- `LOOPS_TRANSACTIONAL_AFFILIATE_REMOVED` (optional Loops template ID for Growth Partner suspension / removal notices)
- `LOOPS_TRANSACTIONAL_AFFILIATE_REINSTATED` (optional Loops template ID for Growth Partner reinstatement notices)
- `WELCOME_DISCOUNT_EMAIL_TO` (optional recipient inbox for internal welcome-discount notifications; defaults to `operations@revalin.ca`)
- `AFFILIATE_APPLICATION_EMAIL_TO` (optional recipient inbox for internal Growth Partner application notifications; defaults to `operations@revalin.ca`)
- `SHIPPING_LABEL_EMAIL` or `SHIPPING_LABEL_EMAILS` (recipient inbox for internal shipping label emails; `SHIPPING_LABEL_EMAILS` accepts comma-separated recipients)

## Checkout requirements

The native `/checkout` flow creates real Swell guest accounts, quotes shipping, creates a real Swell order, then
creates a NOWPayments payment for that Swell order total. For that flow to work:

- `SWELL_SECRET_KEY` must be present
- `SWELL_MANUAL_PAYMENT_METHOD` must match a manual payment method configured in your Swell dashboard
- Either Swell shipping services must be configured, or ShipEngine / Shippo must be configured with API credentials plus origin street/postal code

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
