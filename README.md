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
- `SWELL_CRYPTO_PAYMENT_METHOD` (manual payment method ID configured in Swell Payment Settings for direct crypto payments; defaults to `crypto`)
- `SWELL_CARD_DEBIT_PAYMENT_METHOD` (manual payment method ID configured in Swell Payment Settings for card/debit payments; defaults to `card_debit`)
- `SWELL_INTERAC_PAYMENT_METHOD` (manual payment method ID configured in Swell Payment Settings for Interac payments; defaults to `interac`)
- `SWELL_MANUAL_PAYMENT_METHOD` (legacy manual payment method fallback used only by older call sites; defaults to `crypto`)
- `NOW_PRIVATE_KEY` or `NOWPAYMENTS_API_KEY` (NOWPayments server API key; `NOW_PRIVATE_KEY` is accepted as an alias)
- `NOW_PUBLIC_KEY` or `NOWPAYMENTS_IPN_SECRET` (NOWPayments webhook signing secret; `NOW_PUBLIC_KEY` is accepted as an alias)
- `NEXT_PUBLIC_NOWPAYMENTS_QUICK_CURRENCIES` (optional comma-separated checkout currency chips, e.g. `btc,eth,sol,ltc,usdttrc20,trx`)
- `CHECKOUT_ORDER_STORAGE_PATH` (optional path for persisting checkout order snapshots outside the default local store)
- `SHIPENGINE_API_KEY` (legacy compatibility only; existing ShipEngine labels remain readable during cutover)
- `SHIPENGINE_ORIGIN_STREET1`, `SHIPENGINE_ORIGIN_ZIP` (required to activate ShipEngine live rates / labels)
- `SHIPENGINE_ORIGIN_CITY`, `SHIPENGINE_ORIGIN_STATE`, `SHIPENGINE_ORIGIN_COUNTRY`, `SHIPENGINE_ORIGIN_NAME`, `SHIPENGINE_ORIGIN_COMPANY_NAME`, `SHIPENGINE_ORIGIN_PHONE` (optional origin fields used for rating and labels; company name falls back to `SHIPENGINE_ORIGIN_NAME`)
- `SHIPENGINE_CARRIER_IDS` (optional comma-separated carrier IDs; otherwise carriers are auto-discovered)
- `SHIPENGINE_US_PREFERRED_CARRIERS` (optional comma-separated carrier name/code matchers for US ShipEngine quotes; defaults to `fedex,dhl`)
- `SHIPENGINE_US_REQUIRE_PREFERRED_CARRIERS=true` (optional; when enabled, US ShipEngine quotes return no rates unless a preferred carrier is available. By default, checkout falls back to all returned ShipEngine rates so customers are not blocked when FedEx/DHL are unavailable.)
- `SHIPENGINE_PARCEL_LENGTH_IN`, `SHIPENGINE_PARCEL_WIDTH_IN`, `SHIPENGINE_PARCEL_HEIGHT_IN`, `SHIPENGINE_DEFAULT_ITEM_WEIGHT_OZ` (optional parcel defaults for small-vial shipments)
- `ZONOS_CREDENTIAL_TOKEN` (optional; enables Zonos landed-cost duties, import taxes, and fees on non-domestic checkout shipping)
- Canada Post US labels require a separate Zonos Account Key configured in your Canada Post / ShipStation / ShipEngine carrier settings. `ZONOS_CREDENTIAL_TOKEN` is not that account key and is not forwarded to Canada Post by this app.
- `ZONOS_DUTY_TAX_MODE` (optional; defaults to `DDP_PREFERRED`)
- `ZONOS_ORIGIN_COUNTRY`, `ZONOS_ORIGIN_STREET1`, `ZONOS_ORIGIN_POSTAL_CODE` (optional Zonos origin overrides; falls back to the ShipEngine origin fields)
- `ZONOS_DEFAULT_SERVICE_LEVEL_CODE` (optional; set to the Zonos service-level code from your Zonos dashboard if ShipEngine/Swell service codes do not match Zonos)
- `ZONOS_DEFAULT_ITEM_COUNTRY_OF_ORIGIN` (optional; defaults to the ShipEngine customs origin or `CA`)
- `ZONOS_REQUIRE_LANDED_COST=true` (optional; if enabled, non-domestic checkout fails instead of omitting duties when Zonos cannot return a quote)
- `SHIPPO_API_TOKEN` (server-only; enables live Shippo checkout rates and admin label purchase)
- `SHIPPO_ORIGIN_NAME`, `SHIPPO_ORIGIN_EMAIL`, `SHIPPO_ORIGIN_PHONE`, `SHIPPO_ORIGIN_STREET1`, `SHIPPO_ORIGIN_CITY`, `SHIPPO_ORIGIN_STATE`, `SHIPPO_ORIGIN_ZIP`, `SHIPPO_ORIGIN_COUNTRY` (required to activate Shippo live rates / labels)
- `SHIPPO_API_BASE` (optional; defaults to `https://api.goshippo.com`)
- `SHIPPO_API_VERSION` (optional; defaults to `2018-02-08`)
- `SHIPPO_LABEL_FILE_TYPE` (optional; defaults to `PDF_4x6`)
- `SHIPPO_WEBHOOK_SECRET` (optional; reserved for Shippo webhooks)
- `SHIPPO_PARCEL_LENGTH_IN`, `SHIPPO_PARCEL_WIDTH_IN`, `SHIPPO_PARCEL_HEIGHT_IN`, `SHIPPO_DEFAULT_ITEM_WEIGHT_OZ` (optional parcel defaults for small-vial shipments)
- `LOOPS_API_KEY` (optional; enables Loops events + transactional emails)
- `LOOPS_TRANSACTIONAL_ORDER_CONFIRMATION` (optional Loops template ID for customer order confirmation)
- `LOOPS_TRANSACTIONAL_ORDER_SHIPPED` (optional Loops template ID for customer shipped notification)
- `LOOPS_TRANSACTIONAL_BACK_IN_STOCK` (optional Loops template ID for customer restock notifications)
- `LOOPS_TRANSACTIONAL_SHIPPING_LABEL` (optional Loops template ID for the internal shipping-label email with a label URL)
- `LOOPS_TRANSACTIONAL_EMAIL_VERIFICATION` (optional Loops template ID for 6-digit email verification codes)
- `LOOPS_TRANSACTIONAL_PASSWORD_RESET` (optional Loops template ID for 6-digit password reset codes; falls back to `LOOPS_TRANSACTIONAL_EMAIL_VERIFICATION`)
- `LOOPS_TRANSACTIONAL_WELCOME_DISCOUNT_SUBSCRIBER` (**required** Loops template ID for the customer-facing welcome-discount email sent after newsletter signup or account creation; must expose `discount_code`, `discount_percent`, and `discount_expires_at` data variables)
- `LOOPS_TRANSACTIONAL_PRODUCT_NOTIFICATION_SIGNUP` (optional Loops template ID for customer restock-signup confirmation emails)
- `LOOPS_WELCOME_DISCOUNT_CODE_PROPERTY_KEY` (optional Loops contact property API key for storing the issued welcome code; defaults to `initCode`)
- `LOOPS_WELCOME_DISCOUNT_USED_PROPERTY_KEY` (optional Loops contact property API key for marking welcome-code redemption; defaults to `initCodeUsed`)
- `LOOPS_TRANSACTIONAL_AFFILIATE_APPROVED` (optional Loops template ID for first-time Growth Partner approval)
- `LOOPS_TRANSACTIONAL_AFFILIATE_APPLICATION_RECEIVED` (optional Loops template ID for customer-facing Growth Partner application confirmations; defaults to `cmnmb8o0s00b40iuq46qek8jv`)
- `LOOPS_TRANSACTIONAL_AFFILIATE_REMOVED` (optional Loops template ID for Growth Partner suspension / removal notices)
- `LOOPS_TRANSACTIONAL_AFFILIATE_REINSTATED` (optional Loops template ID for Growth Partner reinstatement notices)
- `LOOPS_TRANSACTIONAL_PROMOTER_APPROVED` (optional Loops template ID for first-time promoter approval; defaults to `cmnusjnuo0aso0i108dq551r4`)
- `LOOPS_TRANSACTIONAL_PROMOTER_APPLICATION_RECEIVED` (optional Loops template ID for customer-facing promoter application confirmations; defaults to `cmnsxr0zc00j70h0q3beqenib`)
- `SHIPPING_LABEL_EMAIL` or `SHIPPING_LABEL_EMAILS` (recipient inbox for internal shipping label emails; `SHIPPING_LABEL_EMAILS` accepts comma-separated recipients)

## Checkout requirements

The native `/checkout` flow creates real Swell guest accounts, quotes shipping, creates a real Swell order, then
creates a NOWPayments payment for that Swell order total. For that flow to work:

- `SWELL_SECRET_KEY` must be present
- `SWELL_CRYPTO_PAYMENT_METHOD`, `SWELL_CARD_DEBIT_PAYMENT_METHOD`, and `SWELL_INTERAC_PAYMENT_METHOD` must match manual payment methods configured in your Swell dashboard
- Either Swell shipping services must be configured, or Shippo must be configured with API credentials plus the required origin fields

## Shippo fulfillment

Checkout quotes live Shippo rates first and falls back to legacy ShipEngine/Swell services when needed. Paid orders stay pending in `/admin/fulfillment` until an admin opens Buy Label, refreshes the latest Shippo rates, reviews the destination/customs data, and purchases the label.

Customs defaults are edited in `/admin/fulfillment`, not through environment variables. The current defaults include the massage oil description, `0.3` unit weight, `CN` origin country, HS/HTS `3304.99`, `EAR99`, and the Anhui Yaotong manufacturer notes. SKU is intentionally not supported for Shippo customs: the app never sends `sku_code` in Shippo payloads.

Shippo API secrets are server-only and must not be exposed through `NEXT_PUBLIC_*` variables or edited in admin.

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
