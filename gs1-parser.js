// Enhanced GS1 Parser with Complete AI Database and Validation
// Based on GS1 General Specifications

const GS1_AIS = {
// Identification AIs
‘00’: {
name: ‘SSCC’,
format: ‘N18’,
description: ‘Serial Shipping Container Code’,
dataTitle: ‘SSCC’,
validation: ‘numeric’,
fixedLength: true
},
‘01’: {
name: ‘GTIN’,
format: ‘N14’,
description: ‘Global Trade Item Number’,
dataTitle: ‘GTIN’,
validation: ‘numeric’,
fixedLength: true
},
‘02’: {
name: ‘CONTENT’,
format: ‘N14’,
description: ‘GTIN of contained trade items’,
dataTitle: ‘CONTENT’,
validation: ‘numeric’,
fixedLength: true
},

// Batch/Lot AIs
‘10’: {
name: ‘BATCH/LOT’,
format: ‘X..20’,
description: ‘Batch or lot number’,
dataTitle: ‘BATCH/LOT’,
validation: ‘alphanumeric’,
fixedLength: false
},

// Date AIs
‘11’: {
name: ‘PROD DATE’,
format: ‘N6’,
description: ‘Production date (YYMMDD)’,
dataTitle: ‘PROD DATE’,
validation: ‘date’,
fixedLength: true
},
‘12’: {
name: ‘DUE DATE’,
format: ‘N6’,
description: ‘Due date for payment (YYMMDD)’,
dataTitle: ‘DUE DATE’,
validation: ‘date’,
fixedLength: true
},
‘13’: {
name: ‘PACK DATE’,
format: ‘N6’,
description: ‘Packaging date (YYMMDD)’,
dataTitle: ‘PACK DATE’,
validation: ‘date’,
fixedLength: true
},
‘15’: {
name: ‘BEST BEFORE’,
format: ‘N6’,
description: ‘Best before date (YYMMDD)’,
dataTitle: ‘BEST BEFORE’,
validation: ‘date’,
fixedLength: true
},
‘16’: {
name: ‘SELL BY’,
format: ‘N6’,
description: ‘Sell by date (YYMMDD)’,
dataTitle: ‘SELL BY’,
validation: ‘date’,
fixedLength: true
},
‘17’: {
name: ‘USE BY’,
format: ‘N6’,
description: ‘Expiration date (YYMMDD)’,
dataTitle: ‘USE BY/EXPIRY’,
validation: ‘date’,
fixedLength: true
},

// Serial Number AIs
‘21’: {
name: ‘SERIAL’,
format: ‘X..20’,
description: ‘Serial number’,
dataTitle: ‘SERIAL’,
validation: ‘alphanumeric’,
fixedLength: false
},
‘22’: {
name: ‘CPV’,
format: ‘X..20’,
description: ‘Consumer product variant’,
dataTitle: ‘CPV’,
validation: ‘alphanumeric’,
fixedLength: false
},
‘235’: {
name: ‘TPX’,
format: ‘X..28’,
description: ‘Third party controlled serialized extension’,
dataTitle: ‘TPX’,
validation: ‘alphanumeric’,
fixedLength: false
},
‘240’: {
name: ‘ADDITIONAL ID’,
format: ‘X..30’,
description: ‘Additional product identification’,
dataTitle: ‘ADDITIONAL ID’,
validation: ‘alphanumeric’,
fixedLength: false
},
‘241’: {
name: ‘CUST. PART NO.’,
format: ‘X..30’,
description: ‘Customer part number’,
dataTitle: ‘CUST. PART NO.’,
validation: ‘alphanumeric’,
fixedLength: false
},
‘242’: {
name: ‘MTO VARIANT’,
format: ‘N..6’,
description: ‘Made-to-order variation number’,
dataTitle: ‘MTO VARIANT’,
validation: ‘numeric’,
fixedLength: false
},
‘243’: {
name: ‘PCN’,
format: ‘X..20’,
description: ‘Packaging component number’,
dataTitle: ‘PCN’,
validation: ‘alphanumeric’,
fixedLength: false
},
‘250’: {
name: ‘SECONDARY SERIAL’,
format: ‘X..30’,
description: ‘Secondary serial number’,
dataTitle: ‘SECONDARY SERIAL’,
validation: ‘alphanumeric’,
fixedLength: false
},
‘251’: {
name: ‘REF. TO SOURCE’,
format: ‘X..30’,
description: ‘Reference to source entity’,
dataTitle: ‘REF. TO SOURCE’,
validation: ‘alphanumeric’,
fixedLength: false
},
‘253’: {
name: ‘GDTI’,
format: ‘N13+X..17’,
description: ‘Global Document Type Identifier’,
dataTitle: ‘GDTI’,
validation: ‘alphanumeric’,
fixedLength: false
},
‘254’: {
name: ‘GLN EXTENSION’,
format: ‘X..20’,
description: ‘GLN extension component’,
dataTitle: ‘GLN EXTENSION’,
validation: ‘alphanumeric’,
fixedLength: false
},
‘255’: {
name: ‘GCN’,
format: ‘N13+N..12’,
description: ‘Global Coupon Number’,
dataTitle: ‘GCN’,
validation: ‘numeric’,
fixedLength: false
},

// Measurements - Weight
‘310’: { name: ‘NET WEIGHT (kg)’, format: ‘N6’, description: ‘Net weight in kilograms’, dataTitle: ‘NET WEIGHT (kg)’, validation: ‘measurement’, fixedLength: true },
‘311’: { name: ‘LENGTH (m)’, format: ‘N6’, description: ‘Length in meters’, dataTitle: ‘LENGTH (m)’, validation: ‘measurement’, fixedLength: true },
‘312’: { name: ‘WIDTH (m)’, format: ‘N6’, description: ‘Width in meters’, dataTitle: ‘WIDTH (m)’, validation: ‘measurement’, fixedLength: true },
‘313’: { name: ‘HEIGHT (m)’, format: ‘N6’, description: ‘Height in meters’, dataTitle: ‘HEIGHT (m)’, validation: ‘measurement’, fixedLength: true },
‘314’: { name: ‘AREA (m²)’, format: ‘N6’, description: ‘Area in square meters’, dataTitle: ‘AREA (m²)’, validation: ‘measurement’, fixedLength: true },
‘315’: { name: ‘NET VOLUME (l)’, format: ‘N6’, description: ‘Net volume in liters’, dataTitle: ‘NET VOLUME (l)’, validation: ‘measurement’, fixedLength: true },
‘316’: { name: ‘NET VOLUME (m³)’, format: ‘N6’, description: ‘Net volume in cubic meters’, dataTitle: ‘NET VOLUME (m³)’, validation: ‘measurement’, fixedLength: true },
‘320’: { name: ‘NET WEIGHT (lb)’, format: ‘N6’, description: ‘Net weight in pounds’, dataTitle: ‘NET WEIGHT (lb)’, validation: ‘measurement’, fixedLength: true },
‘321’: { name: ‘LENGTH (in)’, format: ‘N6’, description: ‘Length in inches’, dataTitle: ‘LENGTH (in)’, validation: ‘measurement’, fixedLength: true },
‘322’: { name: ‘LENGTH (ft)’, format: ‘N6’, description: ‘Length in feet’, dataTitle: ‘LENGTH (ft)’, validation: ‘measurement’, fixedLength: true },
‘323’: { name: ‘LENGTH (yd)’, format: ‘N6’, description: ‘Length in yards’, dataTitle: ‘LENGTH (yd)’, validation: ‘measurement’, fixedLength: true },
‘324’: { name: ‘WIDTH (in)’, format: ‘N6’, description: ‘Width in inches’, dataTitle: ‘WIDTH (in)’, validation: ‘measurement’, fixedLength: true },
‘325’: { name: ‘WIDTH (ft)’, format: ‘N6’, description: ‘Width in feet’, dataTitle: ‘WIDTH (ft)’, validation: ‘measurement’, fixedLength: true },
‘326’: { name: ‘WIDTH (yd)’, format: ‘N6’, description: ‘Width in yards’, dataTitle: ‘WIDTH (yd)’, validation: ‘measurement’, fixedLength: true },
‘327’: { name: ‘HEIGHT (in)’, format: ‘N6’, description: ‘Height in inches’, dataTitle: ‘HEIGHT (in)’, validation: ‘measurement’, fixedLength: true },
‘328’: { name: ‘HEIGHT (ft)’, format: ‘N6’, description: ‘Height in feet’, dataTitle: ‘HEIGHT (ft)’, validation: ‘measurement’, fixedLength: true },
‘329’: { name: ‘HEIGHT (yd)’, format: ‘N6’, description: ‘Height in yards’, dataTitle: ‘HEIGHT (yd)’, validation: ‘measurement’, fixedLength: true },
‘330’: { name: ‘GROSS WEIGHT (kg)’, format: ‘N6’, description: ‘Gross weight in kilograms’, dataTitle: ‘GROSS WEIGHT (kg)’, validation: ‘measurement’, fixedLength: true },
‘331’: { name: ‘LENGTH (m), log’, format: ‘N6’, description: ‘Length in meters (log)’, dataTitle: ‘LENGTH (m), log’, validation: ‘measurement’, fixedLength: true },
‘332’: { name: ‘WIDTH (m), log’, format: ‘N6’, description: ‘Width in meters (log)’, dataTitle: ‘WIDTH (m), log’, validation: ‘measurement’, fixedLength: true },
‘333’: { name: ‘HEIGHT (m), log’, format: ‘N6’, description: ‘Height in meters (log)’, dataTitle: ‘HEIGHT (m), log’, validation: ‘measurement’, fixedLength: true },
‘334’: { name: ‘AREA (m²), log’, format: ‘N6’, description: ‘Area in square meters (log)’, dataTitle: ‘AREA (m²), log’, validation: ‘measurement’, fixedLength: true },
‘335’: { name: ‘VOLUME (l), log’, format: ‘N6’, description: ‘Volume in liters (log)’, dataTitle: ‘VOLUME (l), log’, validation: ‘measurement’, fixedLength: true },
‘336’: { name: ‘VOLUME (m³), log’, format: ‘N6’, description: ‘Volume in cubic meters (log)’, dataTitle: ‘VOLUME (m³), log’, validation: ‘measurement’, fixedLength: true },
‘337’: { name: ‘KG PER m²’, format: ‘N6’, description: ‘Kilograms per square meter’, dataTitle: ‘KG PER m²’, validation: ‘measurement’, fixedLength: true },
‘340’: { name: ‘GROSS WEIGHT (lb)’, format: ‘N6’, description: ‘Gross weight in pounds’, dataTitle: ‘GROSS WEIGHT (lb)’, validation: ‘measurement’, fixedLength: true },
‘341’: { name: ‘LENGTH (in), log’, format: ‘N6’, description: ‘Length in inches (log)’, dataTitle: ‘LENGTH (in), log’, validation: ‘measurement’, fixedLength: true },
‘342’: { name: ‘LENGTH (ft), log’, format: ‘N6’, description: ‘Length in feet (log)’, dataTitle: ‘LENGTH (ft), log’, validation: ‘measurement’, fixedLength: true },
‘343’: { name: ‘LENGTH (yd), log’, format: ‘N6’, description: ‘Length in yards (log)’, dataTitle: ‘LENGTH (yd), log’, validation: ‘measurement’, fixedLength: true },
‘344’: { name: ‘WIDTH (in), log’, format: ‘N6’, description: ‘Width in inches (log)’, dataTitle: ‘WIDTH (in), log’, validation: ‘measurement’, fixedLength: true },
‘345’: { name: ‘WIDTH (ft), log’, format: ‘N6’, description: ‘Width in feet (log)’, dataTitle: ‘WIDTH (ft), log’, validation: ‘measurement’, fixedLength: true },
‘346’: { name: ‘WIDTH (yd), log’, format: ‘N6’, description: ‘Width in yards (log)’, dataTitle: ‘WIDTH (yd), log’, validation: ‘measurement’, fixedLength: true },
‘347’: { name: ‘HEIGHT (in), log’, format: ‘N6’, description: ‘Height in inches (log)’, dataTitle: ‘HEIGHT (in), log’, validation: ‘measurement’, fixedLength: true },
‘348’: { name: ‘HEIGHT (ft), log’, format: ‘N6’, description: ‘Height in feet (log)’, dataTitle: ‘HEIGHT (ft), log’, validation: ‘measurement’, fixedLength: true },
‘349’: { name: ‘HEIGHT (yd), log’, format: ‘N6’, description: ‘Height in yards (log)’, dataTitle: ‘HEIGHT (yd), log’, validation: ‘measurement’, fixedLength: true },
‘350’: { name: ‘AREA (in²)’, format: ‘N6’, description: ‘Area in square inches’, dataTitle: ‘AREA (in²)’, validation: ‘measurement’, fixedLength: true },
‘351’: { name: ‘AREA (ft²)’, format: ‘N6’, description: ‘Area in square feet’, dataTitle: ‘AREA (ft²)’, validation: ‘measurement’, fixedLength: true },
‘352’: { name: ‘AREA (yd²)’, format: ‘N6’, description: ‘Area in square yards’, dataTitle: ‘AREA (yd²)’, validation: ‘measurement’, fixedLength: true },
‘353’: { name: ‘AREA (in²), log’, format: ‘N6’, description: ‘Area in square inches (log)’, dataTitle: ‘AREA (in²), log’, validation: ‘measurement’, fixedLength: true },
‘354’: { name: ‘AREA (ft²), log’, format: ‘N6’, description: ‘Area in square feet (log)’, dataTitle: ‘AREA (ft²), log’, validation: ‘measurement’, fixedLength: true },
‘355’: { name: ‘AREA (yd²), log’, format: ‘N6’, description: ‘Area in square yards (log)’, dataTitle: ‘AREA (yd²), log’, validation: ‘measurement’, fixedLength: true },
‘356’: { name: ‘NET WEIGHT (oz)’, format: ‘N6’, description: ‘Net weight in troy ounces’, dataTitle: ‘NET WEIGHT (oz)’, validation: ‘measurement’, fixedLength: true },
‘357’: { name: ‘NET VOLUME (oz)’, format: ‘N6’, description: ‘Net volume in ounces’, dataTitle: ‘NET VOLUME (oz)’, validation: ‘measurement’, fixedLength: true },
‘360’: { name: ‘NET VOLUME (qt)’, format: ‘N6’, description: ‘Net volume in quarts’, dataTitle: ‘NET VOLUME (qt)’, validation: ‘measurement’, fixedLength: true },
‘361’: { name: ‘NET VOLUME (gal)’, format: ‘N6’, description: ‘Net volume in gallons’, dataTitle: ‘NET VOLUME (gal)’, validation: ‘measurement’, fixedLength: true },
‘362’: { name: ‘VOLUME (qt), log’, format: ‘N6’, description: ‘Volume in quarts (log)’, dataTitle: ‘VOLUME (qt), log’, validation: ‘measurement’, fixedLength: true },
‘363’: { name: ‘VOLUME (gal), log’, format: ‘N6’, description: ‘Volume in gallons (log)’, dataTitle: ‘VOLUME (gal), log’, validation: ‘measurement’, fixedLength: true },
‘364’: { name: ‘NET VOLUME (in³)’, format: ‘N6’, description: ‘Net volume in cubic inches’, dataTitle: ‘NET VOLUME (in³)’, validation: ‘measurement’, fixedLength: true },
‘365’: { name: ‘NET VOLUME (ft³)’, format: ‘N6’, description: ‘Net volume in cubic feet’, dataTitle: ‘NET VOLUME (ft³)’, validation: ‘measurement’, fixedLength: true },
‘366’: { name: ‘NET VOLUME (yd³)’, format: ‘N6’, description: ‘Net volume in cubic yards’, dataTitle: ‘NET VOLUME (yd³)’, validation: ‘measurement’, fixedLength: true },
‘367’: { name: ‘VOLUME (in³), log’, format: ‘N6’, description: ‘Volume in cubic inches (log)’, dataTitle: ‘VOLUME (in³), log’, validation: ‘measurement’, fixedLength: true },
‘368’: { name: ‘VOLUME (ft³), log’, format: ‘N6’, description: ‘Volume in cubic feet (log)’, dataTitle: ‘VOLUME (ft³), log’, validation: ‘measurement’, fixedLength: true },
‘369’: { name: ‘VOLUME (yd³), log’, format: ‘N6’, description: ‘Volume in cubic yards (log)’, dataTitle: ‘VOLUME (yd³), log’, validation: ‘measurement’, fixedLength: true },

// Count
‘37’: {
name: ‘COUNT’,
format: ‘N..8’,
description: ‘Count of trade items’,
dataTitle: ‘COUNT’,
validation: ‘numeric’,
fixedLength: false
},

// Amounts
‘390’: { name: ‘AMOUNT’, format: ‘N..15’, description: ‘Applicable amount payable’, dataTitle: ‘AMOUNT’, validation: ‘numeric’, fixedLength: false },
‘391’: { name: ‘AMOUNT’, format: ‘N3+N..15’, description: ‘Applicable amount payable with ISO currency code’, dataTitle: ‘AMOUNT’, validation: ‘numeric’, fixedLength: false },
‘392’: { name: ‘PRICE’, format: ‘N..15’, description: ‘Applicable amount payable, single item’, dataTitle: ‘PRICE’, validation: ‘numeric’, fixedLength: false },
‘393’: { name: ‘PRICE’, format: ‘N3+N..15’, description: ‘Applicable amount payable, single item with ISO currency code’, dataTitle: ‘PRICE’, validation: ‘numeric’, fixedLength: false },
‘394’: { name: ‘PRCNT OFF’, format: ‘N4’, description: ‘Percentage discount of a coupon’, dataTitle: ‘PRCNT OFF’, validation: ‘numeric’, fixedLength: true },

// Location
‘400’: { name: ‘ORDER NUMBER’, format: ‘X..30’, description: ‘Customer purchase order number’, dataTitle: ‘ORDER NUMBER’, validation: ‘alphanumeric’, fixedLength: false },
‘401’: { name: ‘GINC’, format: ‘X..30’, description: ‘Global Identification Number for Consignment’, dataTitle: ‘GINC’, validation: ‘alphanumeric’, fixedLength: false },
‘402’: { name: ‘GSIN’, format: ‘N17’, description: ‘Global Shipment Identification Number’, dataTitle: ‘GSIN’, validation: ‘numeric’, fixedLength: true },
‘403’: { name: ‘ROUTE’, format: ‘X..30’, description: ‘Routing code’, dataTitle: ‘ROUTE’, validation: ‘alphanumeric’, fixedLength: false },
‘410’: { name: ‘SHIP TO LOC’, format: ‘N13’, description: ‘Ship to/deliver to location (GLN)’, dataTitle: ‘SHIP TO LOC’, validation: ‘numeric’, fixedLength: true },
‘411’: { name: ‘BILL TO’, format: ‘N13’, description: ‘Bill to/invoice location (GLN)’, dataTitle: ‘BILL TO’, validation: ‘numeric’, fixedLength: true },
‘412’: { name: ‘PURCHASE FROM’, format: ‘N13’, description: ‘Purchased from location (GLN)’, dataTitle: ‘PURCHASE FROM’, validation: ‘numeric’, fixedLength: true },
‘413’: { name: ‘SHIP FOR LOC’, format: ‘N13’, description: ‘Ship for/deliver for location (GLN)’, dataTitle: ‘SHIP FOR LOC’, validation: ‘numeric’, fixedLength: true },
‘414’: { name: ‘LOC No’, format: ‘N13’, description: ‘Identification of physical location (GLN)’, dataTitle: ‘LOC No’, validation: ‘numeric’, fixedLength: true },
‘415’: { name: ‘PAY TO’, format: ‘N13’, description: ‘Pay to location (GLN)’, dataTitle: ‘PAY TO’, validation: ‘numeric’, fixedLength: true },
‘416’: { name: ‘PROD/SERV LOC’, format: ‘N13’, description: ‘Production/service location (GLN)’, dataTitle: ‘PROD/SERV LOC’, validation: ‘numeric’, fixedLength: true },
‘417’: { name: ‘PARTY’, format: ‘N13’, description: ‘Party to transaction (GLN)’, dataTitle: ‘PARTY’, validation: ‘numeric’, fixedLength: true },
‘420’: { name: ‘SHIP TO POST’, format: ‘X..20’, description: ‘Ship to postal code’, dataTitle: ‘SHIP TO POST’, validation: ‘alphanumeric’, fixedLength: false },
‘421’: { name: ‘SHIP TO POST’, format: ‘N3+X..9’, description: ‘Ship to postal code with ISO country code’, dataTitle: ‘SHIP TO POST’, validation: ‘alphanumeric’, fixedLength: false },
‘422’: { name: ‘ORIGIN’, format: ‘N3’, description: ‘Country of origin (ISO)’, dataTitle: ‘ORIGIN’, validation: ‘numeric’, fixedLength: true },
‘423’: { name: ‘COUNTRY - INITIAL’, format: ‘N3+N..12’, description: ‘Country of initial processing’, dataTitle: ‘COUNTRY - INITIAL’, validation: ‘numeric’, fixedLength: false },
‘424’: { name: ‘COUNTRY - PROCESS’, format: ‘N3’, description: ‘Country of processing’, dataTitle: ‘COUNTRY - PROCESS’, validation: ‘numeric’, fixedLength: true },
‘425’: { name: ‘COUNTRY - DISASSEMBLY’, format: ‘N3+N..12’, description: ‘Country of disassembly’, dataTitle: ‘COUNTRY - DISASSEMBLY’, validation: ‘numeric’, fixedLength: false },
‘426’: { name: ‘COUNTRY - FULL PROCESS’, format: ‘N3’, description: ‘Country covering full process chain’, dataTitle: ‘COUNTRY - FULL PROCESS’, validation: ‘numeric’, fixedLength: true },
‘427’: { name: ‘ORIGIN SUBDIVISION’, format: ‘X..3’, description: ‘Country subdivision of origin’, dataTitle: ‘ORIGIN SUBDIVISION’, validation: ‘alphanumeric’, fixedLength: false },

// Other
‘7001’: { name: ‘NSN’, format: ‘N13’, description: ‘NATO Stock Number’, dataTitle: ‘NSN’, validation: ‘numeric’, fixedLength: true },
‘7002’: { name: ‘MEAT CUT’, format: ‘X..30’, description: ‘UN/ECE meat carcasses and cuts classification’, dataTitle: ‘MEAT CUT’, validation: ‘alphanumeric’, fixedLength: false },
‘7003’: { name: ‘EXPIRY TIME’, format: ‘N10’, description: ‘Expiration date and time’, dataTitle: ‘EXPIRY TIME’, validation: ‘datetime’, fixedLength: true },
‘7004’: { name: ‘ACTIVE POTENCY’, format: ‘N..4’, description: ‘Active potency’, dataTitle: ‘ACTIVE POTENCY’, validation: ‘numeric’, fixedLength: false },
‘7005’: { name: ‘CATCH AREA’, format: ‘X..12’, description: ‘Catch area’, dataTitle: ‘CATCH AREA’, validation: ‘alphanumeric’, fixedLength: false },
‘7006’: { name: ‘FIRST FREEZE DATE’, format: ‘N6’, description: ‘First freeze date’, dataTitle: ‘FIRST FREEZE DATE’, validation: ‘date’, fixedLength: true },
‘7007’: { name: ‘HARVEST DATE’, format: ‘N6+N..6’, description: ‘Harvest date range’, dataTitle: ‘HARVEST DATE’, validation: ‘date’, fixedLength: false },
‘7008’: { name: ‘AQUATIC SPECIES’, format: ‘X..3’, description: ‘Species for fishery purposes’, dataTitle: ‘AQUATIC SPECIES’, validation: ‘alphanumeric’, fixedLength: false },
‘7009’: { name: ‘FISHING GEAR TYPE’, format: ‘X..10’, description: ‘Fishing gear type’, dataTitle: ‘FISHING GEAR TYPE’, validation: ‘alphanumeric’, fixedLength: false },
‘7010’: { name: ‘PROD METHOD’, format: ‘X..2’, description: ‘Production method’, dataTitle: ‘PROD METHOD’, validation: ‘alphanumeric’, fixedLength: false },
‘7020’: { name: ‘REFURB LOT’, format: ‘X..20’, description: ‘Refurbishment lot ID’, dataTitle: ‘REFURB LOT’, validation: ‘alphanumeric’, fixedLength: false },
‘7021’: { name: ‘FUNC STAT’, format: ‘X..20’, description: ‘Functional status’, dataTitle: ‘FUNC STAT’, validation: ‘alphanumeric’, fixedLength: false },
‘7022’: { name: ‘REV STAT’, format: ‘X..20’, description: ‘Revision status’, dataTitle: ‘REV STAT’, validation: ‘alphanumeric’, fixedLength: false },
‘7023’: { name: ‘GIAI - ASSEMBLY’, format: ‘X..30’, description: ‘Global Individual Asset Identifier of assembly’, dataTitle: ‘GIAI - ASSEMBLY’, validation: ‘alphanumeric’, fixedLength: false },

// Certification
‘7030’: { name: ‘PROCESSOR # 0’, format: ‘N3+X..27’, description: ‘Processor approval with ISO country code (0)’, dataTitle: ‘PROCESSOR # 0’, validation: ‘alphanumeric’, fixedLength: false },
‘7031’: { name: ‘PROCESSOR # 1’, format: ‘N3+X..27’, description: ‘Processor approval with ISO country code (1)’, dataTitle: ‘PROCESSOR # 1’, validation: ‘alphanumeric’, fixedLength: false },
‘7032’: { name: ‘PROCESSOR # 2’, format: ‘N3+X..27’, description: ‘Processor approval with ISO country code (2)’, dataTitle: ‘PROCESSOR # 2’, validation: ‘alphanumeric’, fixedLength: false },
‘7033’: { name: ‘PROCESSOR # 3’, format: ‘N3+X..27’, description: ‘Processor approval with ISO country code (3)’, dataTitle: ‘PROCESSOR # 3’, validation: ‘alphanumeric’, fixedLength: false },
‘7034’: { name: ‘PROCESSOR # 4’, format: ‘N3+X..27’, description: ‘Processor approval with ISO country code (4)’, dataTitle: ‘PROCESSOR # 4’, validation: ‘alphanumeric’, fixedLength: false },
‘7035’: { name: ‘PROCESSOR # 5’, format: ‘N3+X..27’, description: ‘Processor approval with ISO country code (5)’, dataTitle: ‘PROCESSOR # 5’, validation: ‘alphanumeric’, fixedLength: false },
‘7036’: { name: ‘PROCESSOR # 6’, format: ‘N3+X..27’, description: ‘Processor approval with ISO country code (6)’, dataTitle: ‘PROCESSOR # 6’, validation: ‘alphanumeric’, fixedLength: false },
‘7037’: { name: ‘PROCESSOR # 7’, format: ‘N3+X..27’, description: ‘Processor approval with ISO country code (7)’, dataTitle: ‘PROCESSOR # 7’, validation: ‘alphanumeric’, fixedLength: false },
‘7038’: { name: ‘PROCESSOR # 8’, format: ‘N3+X..27’, description: ‘Processor approval with ISO country code (8)’, dataTitle: ‘PROCESSOR # 8’, validation: ‘alphanumeric’, fixedLength: false },
‘7039’: { name: ‘PROCESSOR # 9’, format: ‘N3+X..27’, description: ‘Processor approval with ISO country code (9)’, dataTitle: ‘PROCESSOR # 9’, validation: ‘alphanumeric’, fixedLength: false },
‘7040’: { name: ‘UIC+EXT’, format: ‘X1+X..3’, description: ‘GS1 UIC with extension 1 and importer index’, dataTitle: ‘UIC+EXT’, validation: ‘alphanumeric’, fixedLength: false },

// Protocol
‘710’: { name: ‘NHRN PZN’, format: ‘X..20’, description: ‘National Healthcare Reimbursement Number (PZN)’, dataTitle: ‘NHRN PZN’, validation: ‘alphanumeric’, fixedLength: false },
‘711’: { name: ‘NHRN CIP’, format: ‘X..20’, description: ‘National Healthcare Reimbursement Number (CIP)’, dataTitle: ‘NHRN CIP’, validation: ‘alphanumeric’, fixedLength: false },
‘712’: { name: ‘NHRN CN’, format: ‘X..20’, description: ‘National Healthcare Reimbursement Number (CN)’, dataTitle: ‘NHRN CN’, validation: ‘alphanumeric’, fixedLength: false },
‘713’: { name: ‘NHRN DRN’, format: ‘X..20’, description: ‘National Healthcare Reimbursement Number (DRN)’, dataTitle: ‘NHRN DRN’, validation: ‘alphanumeric’, fixedLength: false },
‘714’: { name: ‘NHRN AIM’, format: ‘X..20’, description: ‘National Healthcare Reimbursement Number (AIM)’, dataTitle: ‘NHRN AIM’, validation: ‘alphanumeric’, fixedLength: false },

// Roll Products
‘8001’: { name: ‘DIMENSIONS’, format: ‘N14’, description: ‘Roll products - width, length, core diameter, direction, splices’, dataTitle: ‘DIMENSIONS’, validation: ‘numeric’, fixedLength: true },
‘8002’: { name: ‘CMT No’, format: ‘X..20’, description: ‘Cellular mobile telephone identifier’, dataTitle: ‘CMT No’, validation: ‘alphanumeric’, fixedLength: false },
‘8003’: { name: ‘GRAI’, format: ‘N14+X..16’, description: ‘Global Returnable Asset Identifier’, dataTitle: ‘GRAI’, validation: ‘alphanumeric’, fixedLength: false },
‘8004’: { name: ‘GIAI’, format: ‘X..30’, description: ‘Global Individual Asset Identifier’, dataTitle: ‘GIAI’, validation: ‘alphanumeric’, fixedLength: false },
‘8005’: { name: ‘PRICE PER UNIT’, format: ‘N6’, description: ‘Price per unit of measure’, dataTitle: ‘PRICE PER UNIT’, validation: ‘numeric’, fixedLength: true },
‘8006’: { name: ‘ITIP’, format: ‘N14+N2+N2’, description: ‘Identification of trade item pieces’, dataTitle: ‘ITIP’, validation: ‘numeric’, fixedLength: true },
‘8007’: { name: ‘IBAN’, format: ‘X..34’, description: ‘International Bank Account Number’, dataTitle: ‘IBAN’, validation: ‘alphanumeric’, fixedLength: false },
‘8008’: { name: ‘PROD TIME’, format: ‘N8+N..4’, description: ‘Date and time of production’, dataTitle: ‘PROD TIME’, validation: ‘datetime’, fixedLength: false },
‘8009’: { name: ‘OPTSEN’, format: ‘X..50’, description: ‘Optically readable sensor indicator’, dataTitle: ‘OPTSEN’, validation: ‘alphanumeric’, fixedLength: false },
‘8010’: { name: ‘CPID’, format: ‘X..30’, description: ‘Component/Part Identifier’, dataTitle: ‘CPID’, validation: ‘alphanumeric’, fixedLength: false },
‘8011’: { name: ‘CPID SERIAL’, format: ‘N..12’, description: ‘Component/Part Identifier serial number’, dataTitle: ‘CPID SERIAL’, validation: ‘numeric’, fixedLength: false },
‘8012’: { name: ‘VERSION’, format: ‘X..20’, description: ‘Software version’, dataTitle: ‘VERSION’, validation: ‘alphanumeric’, fixedLength: false },
‘8013’: { name: ‘GMN’, format: ‘X..25’, description: ‘Global Model Number’, dataTitle: ‘GMN’, validation: ‘alphanumeric’, fixedLength: false },
‘8017’: { name: ‘GSRN - PROVIDER’, format: ‘N18’, description: ‘Global Service Relation Number - Provider’, dataTitle: ‘GSRN - PROVIDER’, validation: ‘numeric’, fixedLength: true },
‘8018’: { name: ‘GSRN - RECIPIENT’, format: ‘N18’, description: ‘Global Service Relation Number - Recipient’, dataTitle: ‘GSRN - RECIPIENT’, validation: ‘numeric’, fixedLength: true },
‘8019’: { name: ‘SRIN’, format: ‘N..10’, description: ‘Service Relation Instance Number’, dataTitle: ‘SRIN’, validation: ‘numeric’, fixedLength: false },
‘8020’: { name: ‘REF No’, format: ‘X..25’, description: ‘Payment slip reference number’, dataTitle: ‘REF No’, validation: ‘alphanumeric’, fixedLength: false },
‘8026’: { name: ‘ITIP CONTENT’, format: ‘N14+N2+N2’, description: ‘Identification of pieces of a trade item (ITIP) contained in a logistics unit’, dataTitle: ‘ITIP CONTENT’, validation: ‘numeric’, fixedLength: true },
‘8110’: { name: ‘COUPON’, format: ‘X..70’, description: ‘Coupon code identification’, dataTitle: ‘COUPON’, validation: ‘alphanumeric’, fixedLength: false },
‘8111’: { name: ‘POINTS’, format: ‘N4’, description: ‘Loyalty points of a coupon’, dataTitle: ‘POINTS’, validation: ‘numeric’, fixedLength: true },
‘8112’: { name: ‘PAPERLESS COUPON’, format: ‘X..70’, description: ‘Paperless coupon code identification’, dataTitle: ‘PAPERLESS COUPON’, validation: ‘alphanumeric’, fixedLength: false },
‘8200’: { name: ‘PRODUCT URL’, format: ‘X..70’, description: ‘Extended packaging URL’, dataTitle: ‘PRODUCT URL’, validation: ‘url’, fixedLength: false },

// Internal
‘90’: { name: ‘INTERNAL’, format: ‘X..30’, description: ‘Mutually agreed between trading partners’, dataTitle: ‘INTERNAL’, validation: ‘alphanumeric’, fixedLength: false },
‘91’: { name: ‘INTERNAL’, format: ‘X..90’, description: ‘Company internal information’, dataTitle: ‘INTERNAL’, validation: ‘alphanumeric’, fixedLength: false },
‘92’: { name: ‘INTERNAL’, format: ‘X..90’, description: ‘Company internal information’, dataTitle: ‘INTERNAL’, validation: ‘alphanumeric’, fixedLength: false },
‘93’: { name: ‘INTERNAL’, format: ‘X..90’, description: ‘Company internal information’, dataTitle: ‘INTERNAL’, validation: ‘alphanumeric’, fixedLength: false },
‘94’: { name: ‘INTERNAL’, format: ‘X..90’, description: ‘Company internal information’, dataTitle: ‘INTERNAL’, validation: ‘alphanumeric’, fixedLength: false },
‘95’: { name: ‘INTERNAL’, format: ‘X..90’, description: ‘Company internal information’, dataTitle: ‘INTERNAL’, validation: ‘alphanumeric’, fixedLength: false },
‘96’: { name: ‘INTERNAL’, format: ‘X..90’, description: ‘Company internal information’, dataTitle: ‘INTERNAL’, validation: ‘alphanumeric’, fixedLength: false },
‘97’: { name: ‘INTERNAL’, format: ‘X..90’, description: ‘Company internal information’, dataTitle: ‘INTERNAL’, validation: ‘alphanumeric’, fixedLength: false },
‘98’: { name: ‘INTERNAL’, format: ‘X..90’, description: ‘Company internal information’, dataTitle: ‘INTERNAL’, validation: ‘alphanumeric’, fixedLength: false },
‘99’: { name: ‘INTERNAL’, format: ‘X..90’, description: ‘Company internal information’, dataTitle: ‘INTERNAL’, validation: ‘alphanumeric’, fixedLength: false },
};

class GS1Parser {
constructor() {
this.data = null;
this.parsed = [];
this.validationErrors = [];
}

parse(rawData) {
this.data = rawData;
this.parsed = [];
this.validationErrors = [];

```
// Remove FNC1 indicator if present
let processData = rawData;
if (rawData.startsWith(']d2')) {
  processData = rawData.substring(3);
} else if (rawData.startsWith(']C1')) {
  processData = rawData.substring(3);
} else if (rawData.startsWith(']e0')) {
  processData = rawData.substring(3);
}

let position = 0;
while (position < processData.length) {
  let matched = false;
  
  // Try AIs from longest to shortest (4 to 2 digits)
  for (let aiLength = 4; aiLength >= 2; aiLength--) {
    const ai = processData.substring(position, position + aiLength);
    
    if (GS1_AIS[ai]) {
      const aiInfo = GS1_AIS[ai];
      position += aiLength;
      
      let value = '';
      let rawValue = '';
      const format = aiInfo.format;
      
      if (aiInfo.fixedLength) {
        // Fixed length
        const length = parseInt(format.match(/\d+/)[0]);
        value = processData.substring(position, position + length);
        rawValue = value;
        position += length;
      } else {
        // Variable length
        const maxLengthMatch = format.match(/\.\.(\d+)/);
        const maxLength = maxLengthMatch ? parseInt(maxLengthMatch[1]) : 30;
        let endPos = processData.indexOf(String.fromCharCode(29), position);
        
        if (endPos === -1) {
          endPos = Math.min(position + maxLength, processData.length);
        }
        
        value = processData.substring(position, endPos);
        rawValue = value;
        position = endPos;
        
        if (position < processData.length && processData.charCodeAt(position) === 29) {
          position++;
        }
      }
      
      // Format and validate
      const formattedValue = this.formatValue(ai, value, aiInfo);
      const errors = this.validateValue(ai, value, aiInfo);
      
      this.parsed.push({
        ai: ai,
        name: aiInfo.name,
        value: formattedValue,
        rawValue: rawValue,
        description: aiInfo.description,
        dataTitle: aiInfo.dataTitle,
        format: aiInfo.format,
        validation: aiInfo.validation,
        errors: errors
      });
      
      if (errors.length > 0) {
        this.validationErrors.push({
          ai: ai,
          errors: errors
        });
      }
      
      matched = true;
      break;
    }
  }
  
  if (!matched) {
    console.warn('Could not parse at position:', position);
    this.validationErrors.push({
      position: position,
      error: 'Unknown AI or invalid format'
    });
    break;
  }
}

return this.parsed;
```

}

formatValue(ai, value, aiInfo) {
// Format dates
if (aiInfo.validation === ‘date’) {
return this.formatDate(value);
}

```
// Format measurements
if (aiInfo.validation === 'measurement') {
  return this.formatMeasurement(ai, value);
}

// Format datetime
if (aiInfo.validation === 'datetime') {
  return this.formatDateTime(value);
}

return value;
```

}

formatDate(dateStr) {
if (dateStr.length === 6) {
const year = ‘20’ + dateStr.substring(0, 2);
const month = dateStr.substring(2, 4);
const day = dateStr.substring(4, 6);
return `${year}-${month}-${day}`;
}
return dateStr;
}

formatMeasurement(ai, value) {
const lastChar = ai.charAt(ai.length - 1);
const decimals = parseInt(lastChar);

```
if (decimals > 0 && value.length > decimals) {
  const intPart = value.substring(0, value.length - decimals);
  const decPart = value.substring(value.length - decimals);
  return `${intPart}.${decPart}`;
}

return value;
```

}

formatDateTime(value) {
if (value.length >= 8) {
const year = ‘20’ + value.substring(0, 2);
const month = value.substring(2, 4);
const day = value.substring(4, 6);
const hour = value.substring(6, 8);

```
  let formatted = `${year}-${month}-${day}T${hour}:00:00`;
  
  if (value.length >= 10) {
    const minute = value.substring(8, 10);
    formatted = `${year}-${month}-${day}T${hour}:${minute}:00`;
  }
  
  return formatted;
}
return value;
```

}

validateValue(ai, value, aiInfo) {
const errors = [];

```
// Check length
if (aiInfo.fixedLength) {
  const expectedLength = parseInt(aiInfo.format.match(/\d+/)[0]);
  if (value.length !== expectedLength) {
    errors.push(`Invalid length: expected ${expectedLength}, got ${value.length}`);
  }
}

// Check format based on validation type
switch (aiInfo.validation) {
  case 'numeric':
    if (!/^\d+$/.test(value)) {
      errors.push('Value must be numeric');
    }
    break;
  
  case 'alphanumeric':
    // Alphanumeric allows any characters
    break;
  
  case 'date':
    if (!/^\d{6}$/.test(value)) {
      errors.push('Date must be in YYMMDD format');
    } else {
      const month = parseInt(value.substring(2, 4));
      const day = parseInt(value.substring(4, 6));
      if (month < 1 || month > 12) {
        errors.push('Invalid month');
      }
      if (day < 1 || day > 31) {
        errors.push('Invalid day');
      }
    }
    break;
  
  case 'datetime':
    if (value.length < 8 || !/^\d+$/.test(value)) {
      errors.push('DateTime must be numeric');
    }
    break;
  
  case 'measurement':
    if (!/^\d+$/.test(value)) {
      errors.push('Measurement must be numeric');
    }
    break;
}

return errors;
```

}

getJSON() {
return JSON.stringify(this.parsed, null, 2);
}

getHumanReadable() {
let output = ‘’;
this.parsed.forEach(item => {
output += `${item.dataTitle} (AI ${item.ai}): ${item.value}\n`;
output += `  ${item.description}\n`;
if (item.errors && item.errors.length > 0) {
output += `  ⚠️ Errors: ${item.errors.join(', ')}\n`;
}
output += `\n`;
});
return output;
}

getProductInfo() {
const info = {};
this.parsed.forEach(item => {
switch(item.ai) {
case ‘01’:
info.gtin = item.value;
break;
case ‘10’:
info.batch = item.value;
break;
case ‘17’:
info.expiryDate = item.value;
break;
case ‘11’:
info.productionDate = item.value;
break;
case ‘15’:
info.bestBeforeDate = item.value;
break;
case ‘21’:
info.serialNumber = item.value;
break;
case ‘310’:
info.weight = item.value + ’ kg’;
break;
case ‘37’:
info.count = item.value;
break;
}
});
return info;
}

hasValidationErrors() {
return this.validationErrors.length > 0;
}

getValidationErrors() {
return this.validationErrors;
}

// Get element by AI
getElement(ai) {
return this.parsed.find(item => item.ai === ai);
}

// Get all AIs present
getApplicationIdentifiers() {
return this.parsed.map(item => item.ai);
}

// Check if AI exists
hasAI(ai) {
return this.parsed.some(item => item.ai === ai);
}
}

export default GS1Parser;