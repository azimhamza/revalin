export interface SwellProduct {
  id: string;
  title: string;
  description: string;
  descriptionHtml: string;
  handle: string;
  productType: string;
  availableForSale?: boolean;
  stockStatus?: string;
  stockLevel?: number;
  category?: {
    id: string;
    name: string;
    handle?: string;
  };
  options: Array<{
    id: string;
    name: string;
    values: string[];
  }>;
  images: {
    edges: Array<{
      node: {
        url: string;
        altText: string;
        thumbhash?: string;
        selectedOptions?: Array<{
          name: string;
          value: string;
        }>;
      };
    }>;
  };
  priceRange: {
    minVariantPrice: {
      amount: string;
      currencyCode: string;
    };
  };
  compareAtPriceRange: {
    minVariantPrice: {
      amount: string;
      currencyCode: string;
    };
  };
  variants: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        price: {
          amount: string;
          currencyCode: string;
        };
        compareAtPrice?: {
          amount: string;
          currencyCode: string;
        };
        availableForSale: boolean;
        stockStatus?: string;
        stockLevel?: number;
        selectedOptions?: Array<{
          name: string;
          value: string;
        }>;
        bulkPriceTiers?: BulkPriceTier[];
      };
    }>;
  };
  bulkPriceTiers?: BulkPriceTier[];
  purchaseCount?: number;
}

export interface SwellApiFile {
  url?: string;
  id?: string;
  date_created?: string;
  date_updated?: string;
}

export interface SwellApiImage {
  id?: string;
  url?: string;
  file?: SwellApiFile;
  alt?: string;
  caption?: string;
  name?: string;
  date_created?: string;
  date_updated?: string;
}

export interface SwellApiCategory {
  id?: string;
  name?: string;
  slug?: string;
  description?: string;
  active?: boolean;
  parent_id?: string;
}

export interface SwellApiOptionValue {
  id?: string;
  name?: string;
  value?: string;
  label?: string;
}

export interface SwellApiOption {
  id?: string;
  name?: string;
  variant?: boolean;
  values?: SwellApiOptionValue[];
}

export interface SwellApiVariant {
  id?: string;
  parent_id?: string;
  name?: string;
  sku?: string;
  price?: number | string;
  sale?: boolean;
  sale_price?: number | string;
  orig_price?: number | string;
  currency?: string;
  active?: boolean;
  stock_status?: string;
  stock_level?: number;
  stock_purchasable?: boolean;
  option_value_ids?: string[];
  images?: SwellApiImage[];
  option_values?: Array<
    SwellApiOptionValue & {
      option?: { name?: string };
      option_id?: string;
    }
  >;
  options?: Record<string, string>;
  price_rules?: unknown;
  prices?: unknown;
  price_breaks?: unknown;
  tiers?: unknown;
  quantity_pricing?: unknown;
  purchase_options?: unknown;
}

export interface SwellApiStock {
  id?: string;
  parent_id?: string;
  variant_id?: string;
  quantity?: number;
  level?: number;
  reason?: 'received' | 'returned' | 'canceled' | 'sold' | 'missing' | 'damaged' | string;
  reason_message?: string;
  location?: string;
  order_id?: string;
  date_created?: string;
  date_updated?: string;
}

export interface SwellApiProduct {
  id?: string;
  name?: string;
  slug?: string;
  description?: string;
  content?: string;
  price?: number | string;
  sale?: boolean;
  sale_price?: number | string;
  orig_price?: number | string;
  currency?: string;
  type?: string;
  tags?: string[];
  active?: boolean;
  stock_status?: string;
  stock_level?: number;
  stock_tracking?: boolean;
  stock_purchasable?: boolean;
  images?: SwellApiImage[];
  image?: SwellApiImage;
  category?: string | SwellApiCategory;
  category_id?: string;
  categories?: Array<SwellApiCategory | string> | SwellApiListResponse<SwellApiCategory | string>;
  options?: SwellApiOption[];
  variants?: SwellApiVariant[] | SwellApiListResponse<SwellApiVariant>;
  stock?: SwellApiStock[] | SwellApiListResponse<SwellApiStock>;
  price_rules?: unknown;
  prices?: unknown;
  price_breaks?: unknown;
  tiers?: unknown;
  quantity_pricing?: unknown;
  purchase_options?: unknown;
  purchase_count?: number;
  date_created?: string;
  date_updated?: string;
}

export interface SwellApiListResponse<T> {
  count?: number;
  page?: number;
  pages?: Record<string, { start: number; end: number }>;
  results?: T[];
}

export interface SwellCollection {
  id: string;
  title: string;
  handle: string;
  description: string;
  image?: {
    url: string;
    altText: string;
  };
}

export interface SwellCartLine {
  id: string;
  quantity: number;
  bulkPriceTiers?: BulkPriceTier[];
  merchandise: {
    id: string;
    title: string;
    price: {
      amount: string;
      currencyCode: string;
    };
    availableQuantity?: number | null;
    selectedOptions: {
      name: string;
      value: string;
    }[];
    product: {
      title: string;
      handle: string;
      availableForSale?: boolean;
      stockStatus?: string;
      stockLevel?: number;
      compareAtPrice?: {
        amount: string;
        currencyCode: string;
      };
      images: {
        edges: Array<{
          node: {
            url: string;
            altText: string;
            thumbhash?: string;
          };
        }>;
      };
    };
  };
}

export interface SwellCart {
  id: string;
  lines: {
    edges: Array<{ node: SwellCartLine }>;
  };
  cost: {
    totalAmount: {
      amount: string;
      currencyCode: string;
    };
    subtotalAmount: {
      amount: string;
      currencyCode: string;
    };
    totalTaxAmount: {
      amount: string;
      currencyCode: string;
    };
  };
  checkoutUrl: string;
}

// Clean types for the Swell-backed storefront structure
export type Collection = {
  handle: string;
  title: string;
  description: string;
  seo: SEO;
  parentCategoryTree: {
    id: string;
    name: string;
  }[];
  updatedAt: string;
  path: string;
};

export type Product = {
  id: string;
  title: string;
  handle: string;
  categoryId?: string;
  description: string;
  descriptionHtml: string;
  featuredImage: Image;
  currencyCode: string;
  stockStatus?: string;
  stockLevel?: number;
  priceRange: {
    maxVariantPrice: Money;
    minVariantPrice: Money;
  };
  compareAtPrice?: Money;
  seo: SEO;
  options: ProductOption[];
  tags: string[];
  variants: ProductVariant[];
  images: Image[];
  availableForSale: boolean;
  bulkPriceTiers?: BulkPriceTier[];
  purchaseCount?: number;
};

export type ProductSortKey =
  | 'RELEVANCE'
  | 'BEST_SELLING'
  | 'CREATED_AT'
  | 'ID'
  | 'PRICE'
  | 'PRODUCT_TYPE'
  | 'TITLE'
  | 'UPDATED_AT'
  | 'VENDOR';

export type ProductCollectionSortKey =
  | 'BEST_SELLING'
  | 'COLLECTION_DEFAULT'
  | 'CREATED'
  | 'ID'
  | 'MANUAL'
  | 'PRICE'
  | 'RELEVANCE'
  | 'TITLE';

export type SelectedOptions = {
  name: string;
  value: string;
}[];

export type ProductVariant = {
  id: string;
  title: string;
  availableForSale: boolean;
  stockStatus?: string;
  stockLevel?: number;
  selectedOptions: SelectedOptions;
  price: Money;
  compareAtPrice?: Money;
  bulkPriceTiers?: BulkPriceTier[];
};

export type ProductOption = {
  id: string;
  name: string;
  values: {
    id: string;
    name: string;
  }[];
};

export type Money = {
  amount: string;
  currencyCode: string;
};

export type BulkPriceTier = {
  minQuantity: number;
  maxQuantity?: number;
  price: Money;
};

export type Image = {
  url: string;
  altText: string;
  height: number;
  width: number;
  selectedOptions?: SelectedOptions;
  thumbhash?: string;
};

export type SEO = {
  title: string;
  description: string;
};

// Cart and checkout related types
export type Cart = {
  id: string;
  checkoutUrl: string;
  cost: {
    subtotalAmount: Money;
    totalAmount: Money;
    totalTaxAmount: Money;
    shippingAmount?: Money;
  };
  totalQuantity: number;
  lines: CartItem[];
};

export type CartItem = {
  id: string;
  quantity: number;
  cost: {
    totalAmount: Money;
  };
  bulkPriceTiers?: BulkPriceTier[];
  merchandise: {
    id: string;
    title: string;
    availableQuantity?: number | null;
    selectedOptions: SelectedOptions;
    product: Product;
  };
};

export type CartProduct = Product;

// Menu and page types for static content
export type Menu = {
  title: string;
  path: string;
};

export type Page = {
  id: string;
  title: string;
  handle: string;
  body: string;
  bodySummary: string;
  seo?: SEO;
  createdAt: string;
  updatedAt: string;
};
