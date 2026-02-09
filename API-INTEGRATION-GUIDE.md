# API INTEGRATION GUIDE FOR GS1 PARSER PWA

## OVERVIEW

Add these FREE APIs to your app for automatic product lookup when a barcode isn't in your master file.

---

## API 1: BROCADE.IO (Best for Medicines) ⭐⭐⭐⭐⭐

### Details
| Field | Value |
|-------|-------|
| **Endpoint URL** | `https://www.brocade.io/api/items/{GTIN}` |
| **Authentication** | ❌ None required (read access is free) |
| **Method** | GET |
| **Response Format** | JSON |
| **Rate Limit** | Reasonable use (no hard limit published) |
| **Use For** | Product lookup when not in master |

### Request Example
```
GET https://www.brocade.io/api/items/05000112628999
```

### Response Example
```json
{
  "gtin14": "05000112628999",
  "name": "Nurofen 200mg Capsules 16 Pack",
  "brand_name": "Nurofen",
  "size": "16 capsules",
  "ingredients": "Ibuprofen 200mg"
}
```

### JavaScript Code for Your App
```javascript
async function lookupBrocade(gtin) {
  try {
    // Pad GTIN to 14 digits
    const gtin14 = gtin.padStart(14, '0');
    
    const response = await fetch(`https://www.brocade.io/api/items/${gtin14}`);
    
    if (!response.ok) {
      return null; // Product not found
    }
    
    const data = await response.json();
    
    return {
      gtin: data.gtin14,
      name: data.name || '',
      brand: data.brand_name || '',
      matchType: 'API-BROCADE'
    };
  } catch (error) {
    console.error('Brocade API error:', error);
    return null;
  }
}
```

---

## API 2: OPEN FOOD FACTS (Best for Food Products) ⭐⭐⭐⭐⭐

### Details
| Field | Value |
|-------|-------|
| **Endpoint URL** | `https://world.openfoodfacts.org/api/v2/product/{BARCODE}.json` |
| **Authentication** | ❌ None required |
| **Method** | GET |
| **Response Format** | JSON |
| **Rate Limit** | Be reasonable, no hard limit |
| **Use For** | Food product lookup |

### Request Example
```
GET https://world.openfoodfacts.org/api/v2/product/5449000000996.json
```

### Response Example
```json
{
  "code": "5449000000996",
  "status": 1,
  "product": {
    "product_name": "Coca-Cola",
    "brands": "Coca-Cola",
    "quantity": "330ml",
    "categories": "Beverages, Sodas"
  }
}
```

### JavaScript Code for Your App
```javascript
async function lookupOpenFoodFacts(barcode) {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`
    );
    
    const data = await response.json();
    
    if (data.status !== 1 || !data.product) {
      return null; // Product not found
    }
    
    return {
      gtin: data.code,
      name: data.product.product_name || '',
      brand: data.product.brands || '',
      matchType: 'API-OPENFOODFACTS'
    };
  } catch (error) {
    console.error('Open Food Facts API error:', error);
    return null;
  }
}
```

---

## API 3: UPC ITEM DB (General Products) ⭐⭐⭐⭐

### Details
| Field | Value |
|-------|-------|
| **Endpoint URL** | `https://api.upcitemdb.com/prod/trial/lookup` |
| **Authentication** | ❌ None for trial (100 requests/day) |
| **Method** | GET |
| **Response Format** | JSON |
| **Rate Limit** | 100 requests/day (free tier) |
| **Use For** | General product lookup |

### Request Example
```
GET https://api.upcitemdb.com/prod/trial/lookup?upc=012345678905
```

### Response Example
```json
{
  "code": "OK",
  "total": 1,
  "items": [
    {
      "ean": "0012345678905",
      "title": "Example Product Name",
      "brand": "Example Brand",
      "description": "Product description here"
    }
  ]
}
```

### JavaScript Code for Your App
```javascript
async function lookupUPCItemDB(barcode) {
  try {
    const response = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`
    );
    
    const data = await response.json();
    
    if (data.code !== 'OK' || !data.items || data.items.length === 0) {
      return null; // Product not found
    }
    
    const item = data.items[0];
    
    return {
      gtin: item.ean || barcode,
      name: item.title || '',
      brand: item.brand || '',
      matchType: 'API-UPCITEMDB'
    };
  } catch (error) {
    console.error('UPCitemdb API error:', error);
    return null;
  }
}
```

---

## API 4: OPEN FDA (US Medicines by NDC) ⭐⭐⭐

### Details
| Field | Value |
|-------|-------|
| **Endpoint URL** | `https://api.fda.gov/drug/ndc.json` |
| **Authentication** | ❌ None required |
| **Method** | GET |
| **Response Format** | JSON |
| **Rate Limit** | 240 requests/minute without key |
| **Use For** | US drug lookup by NDC code |

### Request Example
```
GET https://api.fda.gov/drug/ndc.json?search=product_ndc:"0069-1520"&limit=1
```

### Response Example
```json
{
  "results": [
    {
      "product_ndc": "0069-1520",
      "generic_name": "IBUPROFEN",
      "brand_name": "ADVIL",
      "dosage_form": "TABLET, COATED",
      "labeler_name": "Pfizer Consumer Healthcare"
    }
  ]
}
```

### JavaScript Code for Your App
```javascript
async function lookupFDA(barcode) {
  try {
    // Try to extract NDC from barcode (remove check digit, format as NDC)
    // US GTINs starting with 03 contain NDC
    let ndc = barcode;
    
    if (barcode.startsWith('003') && barcode.length >= 12) {
      // Extract NDC from GTIN: 003XXXXX-XXXX-XX format
      ndc = barcode.substring(3, 13);
    }
    
    const response = await fetch(
      `https://api.fda.gov/drug/ndc.json?search=product_ndc:"${ndc}"&limit=1`
    );
    
    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      return null;
    }
    
    const drug = data.results[0];
    
    return {
      gtin: barcode,
      name: `${drug.brand_name || drug.generic_name} ${drug.dosage_form || ''}`.trim(),
      brand: drug.labeler_name || '',
      matchType: 'API-FDA'
    };
  } catch (error) {
    console.error('FDA API error:', error);
    return null;
  }
}
```

---

## COMBINED LOOKUP FUNCTION

Add this to your `app.js` to try multiple APIs in order:

```javascript
/**
 * Look up product from external APIs when not found in master
 * Tries APIs in order: Brocade → Open Food Facts → UPCitemdb
 * 
 * @param {string} gtin - The barcode to look up
 * @returns {Promise<{name: string, matchType: string} | null>}
 */
async function lookupExternalAPIs(gtin) {
  // Clean the GTIN
  const cleanGtin = gtin.replace(/\D/g, '');
  
  // Try Brocade first (best for medicines)
  let result = await lookupBrocade(cleanGtin);
  if (result && result.name) {
    return result;
  }
  
  // Try Open Food Facts (best for food)
  result = await lookupOpenFoodFacts(cleanGtin);
  if (result && result.name) {
    return result;
  }
  
  // Try UPCitemdb (general products)
  result = await lookupUPCItemDB(cleanGtin);
  if (result && result.name) {
    return result;
  }
  
  // No results from any API
  return null;
}


// ============================================
// INDIVIDUAL API FUNCTIONS
// ============================================

async function lookupBrocade(gtin) {
  try {
    const gtin14 = gtin.padStart(14, '0');
    const response = await fetch(`https://www.brocade.io/api/items/${gtin14}`);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return {
      gtin: data.gtin14,
      name: data.name || '',
      brand: data.brand_name || '',
      matchType: 'API'
    };
  } catch (e) {
    return null;
  }
}

async function lookupOpenFoodFacts(barcode) {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`
    );
    const data = await response.json();
    
    if (data.status !== 1 || !data.product) return null;
    
    return {
      gtin: data.code,
      name: data.product.product_name || '',
      brand: data.product.brands || '',
      matchType: 'API'
    };
  } catch (e) {
    return null;
  }
}

async function lookupUPCItemDB(barcode) {
  try {
    const response = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`
    );
    const data = await response.json();
    
    if (data.code !== 'OK' || !data.items?.length) return null;
    
    return {
      gtin: data.items[0].ean || barcode,
      name: data.items[0].title || '',
      brand: data.items[0].brand || '',
      matchType: 'API'
    };
  } catch (e) {
    return null;
  }
}
```

---

## WHERE TO ADD IN YOUR APP

### Modify the `matchProduct()` function in `app.js`:

Find this function and add API lookup at the end:

```javascript
async function matchProduct(gtin14, gtin13) {
  // ... existing matching code ...
  
  // STEP 1: Exact match (existing)
  // STEP 2: Last-8 match (existing)
  // STEP 3: Seq-6 match (existing)
  
  // STEP 4: API LOOKUP (NEW!)
  if (navigator.onLine) {  // Only try if online
    const apiResult = await lookupExternalAPIs(gtin14);
    if (apiResult && apiResult.name) {
      return {
        name: apiResult.name,
        matchType: 'API',
        matchedGtin: gtin14
      };
    }
  }
  
  // STEP 5: No match found
  return {
    name: '',
    matchType: 'NONE',
    matchedGtin: null
  };
}
```

**Note:** You'll need to make `matchProduct()` async if it isn't already.

---

## ADD API BADGE COLOR

In your CSS, add a color for API matches:

```css
.badge-api {
  background: rgba(139, 92, 246, 0.15);
  color: #a78bfa;
  border: 1px solid rgba(139, 92, 246, 0.3);
}
```

In the badge rendering code:

```javascript
case 'API':
  badgeClass = 'badge-api';
  break;
```

---

## SETTINGS TOGGLE (Optional)

Let users enable/disable API lookups:

```html
<!-- Add to Settings/Backup tab -->
<div class="setting-row">
  <label>
    <input type="checkbox" id="enableApiLookup" checked>
    Auto-lookup unknown products via API
  </label>
</div>
```

```javascript
// Check setting before API call
const enableApiLookup = document.getElementById('enableApiLookup')?.checked ?? true;

if (enableApiLookup && navigator.onLine) {
  const apiResult = await lookupExternalAPIs(gtin14);
  // ...
}
```

---

## SUMMARY TABLE

| API | Auth | Rate Limit | Best For | Endpoint |
|-----|------|------------|----------|----------|
| Brocade.io | None | Unlimited* | Medicines | `/api/items/{GTIN}` |
| Open Food Facts | None | Unlimited* | Food | `/api/v2/product/{CODE}.json` |
| UPCitemdb | None | 100/day | General | `/prod/trial/lookup?upc={CODE}` |
| Open FDA | None | 240/min | US Drugs | `/drug/ndc.json?search=...` |

*Be reasonable with requests

---

## QUICK COPY-PASTE

### Add these 3 things to your app.js:

1. **The API functions** (from "COMBINED LOOKUP FUNCTION" section above)
2. **Modify matchProduct()** to call `lookupExternalAPIs()` 
3. **Add badge CSS** for API match type

---

## NEED HELP?

Upload your current `app.js` and I'll add the API integration for you!
