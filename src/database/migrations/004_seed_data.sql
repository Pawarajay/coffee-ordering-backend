

SET FOREIGN_KEY_CHECKS = 0;

INSERT INTO stores (id, name, address, city, state, pincode, phone, email, timezone, is_active, operating_hours, config)
VALUES
  (1, 'TOOF Bandra',
   'Shop 12, Linking Road, Bandra West', 'Mumbai', 'Maharashtra', '400050',
   '9876540001', 'bandra@toof.in', 'Asia/Kolkata', 1,
   '{"mon":{"open":"08:00","close":"22:00"},"tue":{"open":"08:00","close":"22:00"},"wed":{"open":"08:00","close":"22:00"},"thu":{"open":"08:00","close":"22:00"},"fri":{"open":"08:00","close":"23:00"},"sat":{"open":"09:00","close":"23:00"},"sun":{"open":"09:00","close":"21:00"}}',
   '{"tax_rate":0.18,"currency":"INR","kiosk_enabled":true}'
  ),
  (2, 'TOOF Andheri',
   'Ground Floor, Infiniti Mall, Andheri West', 'Mumbai', 'Maharashtra', '400053',
   '9876540002', 'andheri@toof.in', 'Asia/Kolkata', 1,
   '{"mon":{"open":"10:00","close":"22:00"},"tue":{"open":"10:00","close":"22:00"},"wed":{"open":"10:00","close":"22:00"},"thu":{"open":"10:00","close":"22:00"},"fri":{"open":"10:00","close":"23:00"},"sat":{"open":"10:00","close":"23:00"},"sun":{"open":"10:00","close":"22:00"}}',
   '{"tax_rate":0.18,"currency":"INR","kiosk_enabled":true}'
  ),
  (3, 'TOOF Central Kitchen',
   'Unit 4, MIDC Industrial Area, Andheri East', 'Mumbai', 'Maharashtra', '400093',
   '9876540003', 'kitchen@toof.in', 'Asia/Kolkata', 1,
   NULL,
   '{"tax_rate":0,"currency":"INR","kiosk_enabled":false,"is_central_kitchen":true}'
  );


INSERT INTO users (id, mobile, name, email, role, store_id, is_active)
VALUES
  (1,  '9000000001', 'Arjun Mehta',     'arjun@toof.in',         'super_admin', NULL, 1),
  (2,  '9000000002', 'Priya Sharma',    'priya@toof.in',         'admin',       NULL, 1),
  (3,  '9000000003', 'Ravi Kumar',      'ravi@toof.in',          'store_manager', 1,  1),
  (4,  '9000000004', 'Sneha Patil',     'sneha@toof.in',         'store_manager', 2,  1),
  (5,  '9000000005', 'Amit Joshi',      'amit.j@toof.in',        'barista',     1,   1),
  (6,  '9000000006', 'Deepa Nair',      'deepa.n@toof.in',       'barista',     1,   1),
  (7,  '9000000007', 'Rahul Singh',     'rahul.s@toof.in',       'barista',     2,   1),
  (8,  '9000000008', 'Kavya Reddy',     'kavya.r@gmail.com',     'customer',    NULL, 1),
  (9,  '9000000009', 'Nikhil Bose',     'nikhil.b@gmail.com',    'customer',    NULL, 1),
  (10, '9000000010', 'Aarav Malhotra',  'aarav.m@gmail.com',     'customer',    NULL, 1),
  (11, '9000000011', 'Tara Iyer',       'tara.i@gmail.com',      'customer',    NULL, 1),
  (12, '9000000012', 'Siddharth Patel', 'sid.p@gmail.com',       'customer',    NULL, 1);


INSERT INTO categories (id, name, slug, description, display_order, is_active)
VALUES
  (1, 'Cold Brews',      'cold-brews',      'Slow-steeped cold brew coffees',              1, 1),
  (2, 'Hot Coffees',     'hot-coffees',      'Freshly brewed espresso-based drinks',        2, 1),
  (3, 'Create Your Own', 'create-your-own',  'Build your custom coffee from scratch',       3, 1),
  (4, 'Iced Lattes',     'iced-lattes',      'Espresso over ice with your choice of milk',  4, 1),
  (5, 'Concentrates',    'concentrates',     'TOOF coffee concentrates for home brewing',   5, 1),
  (6, 'Snacks',          'snacks',           'Light bites to pair with your coffee',        6, 1);


INSERT INTO products (id, category_id, name, slug, description, product_type, base_price, is_customizable, is_available_kiosk, is_available_d2c, is_active, display_order)
VALUES
  -- Cold Brews
  (1,  1, 'Classic Cold Brew',        'classic-cold-brew',        'Our signature 18-hour cold brew concentrate over ice', 'beverage', 220.00, 0, 1, 0, 1, 1),
  (2,  1, 'Vanilla Cold Brew',        'vanilla-cold-brew',        'Cold brew with sweet vanilla notes',                  'beverage', 250.00, 0, 1, 0, 1, 2),
  (3,  1, 'Nitro Cold Brew',          'nitro-cold-brew',          'Nitrogen-infused silky smooth cold brew',             'beverage', 280.00, 0, 1, 0, 1, 3),
  -- Hot Coffees
  (4,  2, 'Espresso',                 'espresso',                 'Double shot of freshly pulled espresso',              'beverage',  90.00, 0, 1, 0, 1, 1),
  (5,  2, 'Cappuccino',               'cappuccino',               'Espresso with steamed milk and thick froth',          'beverage', 180.00, 0, 1, 0, 1, 2),
  (6,  2, 'Flat White',               'flat-white',               'Ristretto shots with velvety steamed whole milk',     'beverage', 200.00, 0, 1, 0, 1, 3),
  (7,  2, 'Americano',                'americano',                'Espresso diluted with hot water',                     'beverage', 150.00, 0, 1, 0, 1, 4),
  -- Create Your Own (CYOD base)
  (8,  3, 'Your Custom Cold Brew',    'custom-cold-brew',         'Build your own cold brew from scratch',               'beverage', 180.00, 1, 1, 0, 1, 1),
  (9,  3, 'Your Custom Latte',        'custom-latte',             'Build your own latte your way',                       'beverage', 160.00, 1, 1, 0, 1, 2),
  -- Iced Lattes
  (10, 4, 'Oat Milk Iced Latte',      'oat-milk-iced-latte',      'Espresso over ice with oat milk',                     'beverage', 240.00, 0, 1, 0, 1, 1),
  (11, 4, 'Almond Milk Iced Latte',   'almond-milk-iced-latte',   'Espresso over ice with almond milk',                  'beverage', 250.00, 0, 1, 0, 1, 2),
  (12, 4, 'Classic Iced Latte',       'classic-iced-latte',       'Espresso over ice with full cream milk',              'beverage', 200.00, 0, 1, 0, 1, 3),
  -- Concentrates (D2C)
  (13, 5, 'Cold Brew Concentrate 500ml', 'cold-brew-concentrate-500ml', '2x strength cold brew for home dilution',      'concentrate', 499.00, 0, 0, 1, 1, 1),
  (14, 5, 'Cold Brew Concentrate 1L',   'cold-brew-concentrate-1l',   'Family pack cold brew concentrate',              'concentrate', 899.00, 0, 0, 1, 1, 2),
  (15, 5, 'Vanilla Infused Concentrate','vanilla-infused-concentrate', 'Cold brew with natural vanilla extract',         'concentrate', 549.00, 0, 0, 1, 1, 3),
  -- Snacks
  (16, 6, 'Banana Walnut Muffin',     'banana-walnut-muffin',     'House-baked banana walnut muffin',                    'food',      120.00, 0, 1, 0, 1, 1),
  (17, 6, 'Almond Biscotti',          'almond-biscotti',          'Classic Italian almond biscotti',                     'food',       80.00, 0, 1, 0, 1, 2);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. INGREDIENTS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ingredients (id, name, unit, cost_per_unit, low_stock_threshold, critical_stock_threshold, is_active)
VALUES
  -- Base liquids
  (1,  'Cold Brew Concentrate',  'ml',  0.40,  2000,  500,  1),
  (2,  'Espresso Shot',          'ml',  0.80,  1000,  200,  1),
  (3,  'Hot Water',              'ml',  0.01,  5000, 1000,  1),
  -- Milks
  (4,  'Full Cream Milk',        'ml',  0.05,  3000,  500,  1),
  (5,  'Oat Milk',               'ml',  0.12,  2000,  400,  1),
  (6,  'Almond Milk',            'ml',  0.15,  1500,  300,  1),
  (7,  'Soy Milk',               'ml',  0.10,  1500,  300,  1),
  (8,  'Coconut Milk',           'ml',  0.14,  1000,  200,  1),
  -- Syrups & Flavours
  (9,  'Vanilla Syrup',          'ml',  0.60,   500,  100,  1),
  (10, 'Caramel Syrup',          'ml',  0.60,   500,  100,  1),
  (11, 'Hazelnut Syrup',         'ml',  0.65,   500,  100,  1),
  (12, 'Brown Sugar Syrup',      'ml',  0.50,   500,  100,  1),
  (13, 'Classic Syrup (Sugar)',  'ml',  0.30,   800,  150,  1),
  -- Toppings & Add-ons
  (14, 'Whipped Cream',          'ml',  0.45,   300,   60,  1),
  (15, 'Cocoa Powder',           'g',   0.20,   200,   40,  1),
  (16, 'Cinnamon Powder',        'g',   0.25,   100,   20,  1),
  (17, 'Ice Cubes',              'pcs', 0.02,   200,   50,  1),
  (18, 'Nitrogen (Nitro)',       'ml',  0.10,   500,  100,  1),
  -- Extras
  (19, 'Extra Espresso Shot',    'ml',  0.80,   500,  100,  1),
  (20, 'Oat Milk Foam',          'ml',  0.18,   500,  100,  1);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. INGREDIENT GROUPS (for CYOD engine)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ingredient_groups (id, name, description, selection_type, is_required, display_order, is_active)
VALUES
  (1, 'Choose Your Base',      'Select your coffee base',           'single',   1, 1, 1),
  (2, 'Choose Your Milk',      'Select milk type',                  'single',   1, 2, 1),
  (3, 'Add Syrup',             'Add a flavour syrup (optional)',     'single',   0, 3, 1),
  (4, 'Add Shots',             'Add extra espresso shots',          'multiple', 0, 4, 1),
  (5, 'Add Toppings',          'Finishing touches',                 'multiple', 0, 5, 1),
  (6, 'Milk Temperature',      'Hot or cold milk',                  'single',   1, 6, 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. INGREDIENT MAPPINGS (CYOD products — product 8 & 9)
-- Product 8: Custom Cold Brew
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ingredient_mappings
  (product_id, ingredient_id, group_id, quantity, is_default, is_optional, price_override, min_qty, max_qty, step_qty)
VALUES
  -- Base (group 1)
  (8, 1, 1,  120, 1, 0, NULL,  60, 240, 30),  -- Cold Brew Concentrate (default 120ml)
  -- Milks (group 2)
  (8, 4, 2,  100, 1, 0, NULL,  60, 200, 20),  -- Full Cream (default)
  (8, 5, 2,  100, 0, 0, 5.00,  60, 200, 20),  -- Oat Milk (+₹5)
  (8, 6, 2,  100, 0, 0, 8.00,  60, 200, 20),  -- Almond Milk (+₹8)
  (8, 7, 2,  100, 0, 0, 4.00,  60, 200, 20),  -- Soy Milk (+₹4)
  (8, 8, 2,  100, 0, 0, 6.00,  60, 200, 20),  -- Coconut Milk (+₹6)
  -- Syrups (group 3)
  (8, 9,  3, 15, 0, 1, NULL,   0,  30, 5),    -- Vanilla Syrup
  (8, 10, 3, 15, 0, 1, NULL,   0,  30, 5),    -- Caramel Syrup
  (8, 11, 3, 15, 0, 1, NULL,   0,  30, 5),    -- Hazelnut Syrup
  (8, 12, 3, 15, 0, 1, NULL,   0,  30, 5),    -- Brown Sugar Syrup
  (8, 13, 3, 15, 0, 1, NULL,   0,  30, 5),    -- Classic Sugar Syrup
  -- Extra shots (group 4)
  (8, 19, 4, 30, 0, 1, NULL,   0,  60, 30),   -- Extra Espresso Shot
  -- Toppings (group 5)
  (8, 14, 5, 30, 0, 1, NULL,   0,  60, 10),   -- Whipped Cream
  (8, 15, 5, 2,  0, 1, NULL,   0,   5,  1),   -- Cocoa Powder (g)
  (8, 16, 5, 1,  0, 1, NULL,   0,   3,  1),   -- Cinnamon Powder (g)
  -- Ice always default for cold brew
  (8, 17, NULL, 5, 1, 0, 0.00, 0,  10,  1);   -- Ice Cubes (free)

-- Product 9: Custom Latte
INSERT INTO ingredient_mappings
  (product_id, ingredient_id, group_id, quantity, is_default, is_optional, price_override, min_qty, max_qty, step_qty)
VALUES
  -- Base espresso (group 1)
  (9, 2, 1,  60, 1, 0, NULL,  30, 90, 30),    -- Espresso (60ml default = 2 shots)
  -- Milks (group 2)
  (9, 4, 2, 150, 1, 0, NULL, 100, 250, 25),   -- Full Cream (default)
  (9, 5, 2, 150, 0, 0, 5.00, 100, 250, 25),   -- Oat Milk (+₹5)
  (9, 6, 2, 150, 0, 0, 8.00, 100, 250, 25),   -- Almond Milk (+₹8)
  (9, 7, 2, 150, 0, 0, 4.00, 100, 250, 25),   -- Soy Milk (+₹4)
  -- Syrups (group 3)
  (9, 9,  3, 15, 0, 1, NULL, 0, 30, 5),       -- Vanilla
  (9, 10, 3, 15, 0, 1, NULL, 0, 30, 5),       -- Caramel
  (9, 12, 3, 15, 0, 1, NULL, 0, 30, 5),       -- Brown Sugar
  (9, 13, 3, 15, 0, 1, NULL, 0, 30, 5),       -- Classic Sugar
  -- Extra shots (group 4)
  (9, 19, 4, 30, 0, 1, NULL, 0, 60, 30),      -- Extra Shot
  -- Toppings (group 5)
  (9, 14, 5, 30, 0, 1, NULL, 0, 60, 10),      -- Whipped Cream
  (9, 20, 5, 20, 0, 1, NULL, 0, 40, 10),      -- Oat Milk Foam
  (9, 15, 5, 2,  0, 1, NULL, 0,  5,  1),      -- Cocoa Powder
  (9, 16, 5, 1,  0, 1, NULL, 0,  3,  1);      -- Cinnamon

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. STORE-LEVEL INVENTORY (initial stock for both stores)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO inventory (store_id, ingredient_id, quantity, reserved_qty)
VALUES
  -- Bandra store (store_id=1)
  (1, 1,  5000,  0),   -- Cold Brew Concentrate
  (1, 2,  2000,  0),   -- Espresso
  (1, 3, 10000,  0),   -- Hot Water
  (1, 4,  6000,  0),   -- Full Cream Milk
  (1, 5,  4000,  0),   -- Oat Milk
  (1, 6,  3000,  0),   -- Almond Milk
  (1, 7,  2000,  0),   -- Soy Milk
  (1, 8,  1500,  0),   -- Coconut Milk
  (1, 9,   800,  0),   -- Vanilla Syrup
  (1, 10,  800,  0),   -- Caramel Syrup
  (1, 11,  600,  0),   -- Hazelnut Syrup
  (1, 12,  700,  0),   -- Brown Sugar Syrup
  (1, 13, 1000,  0),   -- Classic Syrup
  (1, 14,  400,  0),   -- Whipped Cream
  (1, 15,  300,  0),   -- Cocoa Powder (g)
  (1, 16,  150,  0),   -- Cinnamon Powder (g)
  (1, 17, 5000,  0),   -- Ice Cubes (pcs)
  (1, 18,  800,  0),   -- Nitrogen
  (1, 19, 1000,  0),   -- Extra Espresso Shot
  (1, 20,  500,  0),   -- Oat Milk Foam
  -- Andheri store (store_id=2)
  (2, 1,  4000,  0),
  (2, 2,  1800,  0),
  (2, 3,  8000,  0),
  (2, 4,  5000,  0),
  (2, 5,  3500,  0),
  (2, 6,  2500,  0),
  (2, 7,  1500,  0),
  (2, 8,  1200,  0),
  (2, 9,   600,  0),
  (2, 10,  700,  0),
  (2, 11,  500,  0),
  (2, 12,  600,  0),
  (2, 13,  900,  0),
  (2, 14,  350,  0),
  (2, 15,  250,  0),
  (2, 16,  120,  0),
  (2, 17, 4000,  0),
  (2, 18,  600,  0),
  (2, 19,  800,  0),
  (2, 20,  400,  0);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. CENTRAL RAW MATERIALS (central kitchen stock)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO central_raw_materials (ingredient_id, quantity)
VALUES
  (1,  50000),   -- Cold Brew Concentrate (50L)
  (4,  30000),   -- Full Cream Milk (30L)
  (5,  20000),   -- Oat Milk (20L)
  (9,   5000),   -- Vanilla Syrup (5L)
  (10,  5000),   -- Caramel Syrup (5L)
  (13, 10000);   -- Classic Sugar Syrup (10L)

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. CENTRAL INVENTORY (finished products at central kitchen)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO central_inventory (product_id, quantity_ml)
VALUES
  (13, 12000),   -- Cold Brew Concentrate 500ml — 12L available
  (14, 15000),   -- Cold Brew Concentrate 1L   — 15L available
  (15,  8000);   -- Vanilla Infused Concentrate — 8L available

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. SAMPLE ORDERS (3 complete orders for testing dashboards/reports)
-- ─────────────────────────────────────────────────────────────────────────────
-- Order 1 — Completed, paid, kiosk, Bandra
INSERT INTO orders (id, uuid, order_number, store_id, customer_id, channel, status,
  subtotal, discount_amount, tax_amount, total_amount,
  confirmed_at, in_progress_at, ready_at, completed_at)
VALUES
  (1, UUID(), 'TOOF-20250501-0001', 1, 8, 'kiosk', 'completed',
   420.00, 0, 75.60, 495.60,
   NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 2 DAY + INTERVAL 2 MINUTE,
   NOW() - INTERVAL 2 DAY + INTERVAL 7 MINUTE,
   NOW() - INTERVAL 2 DAY + INTERVAL 10 MINUTE);

INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price, item_name)
VALUES
  (1, 1, 1, 220.00, 220.00, 'Classic Cold Brew'),
  (1, 5, 1, 180.00, 180.00, 'Cappuccino'),
  (1, 16, 1, 120.00, 120.00, 'Banana Walnut Muffin');

INSERT INTO kots (uuid, kot_number, order_id, store_id, status, printed_at, started_at, completed_at)
VALUES
  (UUID(), 'KOT-20250501-0001', 1, 1, 'done',
   NOW() - INTERVAL 2 DAY,
   NOW() - INTERVAL 2 DAY + INTERVAL 1 MINUTE,
   NOW() - INTERVAL 2 DAY + INTERVAL 7 MINUTE);

INSERT INTO payments (uuid, order_id, amount, method, status, gateway_provider)
VALUES (UUID(), 1, 495.60, 'upi', 'success', 'razorpay');

-- Order 2 — In progress, QR mobile, Bandra
INSERT INTO orders (id, uuid, order_number, store_id, customer_id, channel, status,
  subtotal, discount_amount, tax_amount, total_amount, confirmed_at, in_progress_at)
VALUES
  (2, UUID(), 'TOOF-20250501-0002', 1, 9, 'qr_mobile', 'in_progress',
   490.00, 0, 88.20, 578.20,
   NOW() - INTERVAL 15 MINUTE,
   NOW() - INTERVAL 10 MINUTE);

INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price, item_name)
VALUES
  (2, 10, 2, 240.00, 480.00, 'Oat Milk Iced Latte'),
  (2, 17,  1, 80.00,  80.00, 'Almond Biscotti');

INSERT INTO kots (uuid, kot_number, order_id, store_id, barista_id, status, printed_at, started_at)
VALUES
  (UUID(), 'KOT-20250501-0002', 2, 1, 5, 'in_progress',
   NOW() - INTERVAL 14 MINUTE,
   NOW() - INTERVAL 10 MINUTE);

INSERT INTO payments (uuid, order_id, amount, method, status, gateway_provider)
VALUES (UUID(), 2, 578.20, 'card', 'success', 'razorpay');

-- Order 3 — Pending (no payment yet), Andheri
INSERT INTO orders (id, uuid, order_number, store_id, customer_id, channel, status,
  subtotal, discount_amount, tax_amount, total_amount)
VALUES
  (3, UUID(), 'TOOF-20250501-0003', 2, 10, 'kiosk', 'pending',
   280.00, 0, 50.40, 330.40);

INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price, item_name)
VALUES
  (3, 3, 1, 280.00, 280.00, 'Nitro Cold Brew');

INSERT INTO kots (uuid, kot_number, order_id, store_id, status)
VALUES (UUID(), 'KOT-20250501-0003', 3, 2, 'open');

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. SAMPLE CUSTOM DRINKS (saved by customers)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO custom_drinks (uuid, customer_id, base_product_id, name, total_price, ingredients, is_favourite, order_count)
VALUES
  (UUID(), 8, 8, 'Kavya''s Morning Brew', 253.00,
   '[{"ingredient_id":1,"quantity":120,"unit_price":0.40,"line_price":48.00},{"ingredient_id":5,"quantity":100,"unit_price":0.12,"line_price":12.00},{"ingredient_id":9,"quantity":15,"unit_price":0.60,"line_price":9.00}]',
   1, 5),
  (UUID(), 9, 9, 'Nikhil''s Power Latte', 268.00,
   '[{"ingredient_id":2,"quantity":90,"unit_price":0.80,"line_price":72.00},{"ingredient_id":5,"quantity":150,"unit_price":0.12,"line_price":18.00},{"ingredient_id":10,"quantity":15,"unit_price":0.60,"line_price":9.00}]',
   0, 2);

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. ORDER STATUS HISTORY (audit trail for sample orders)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
VALUES
  (1, NULL, 'pending',     8),
  (1, 'pending',     'confirmed',    1),
  (1, 'confirmed',   'in_progress',  5),
  (1, 'in_progress', 'ready',        5),
  (1, 'ready',       'completed',    5),
  (2, NULL, 'pending',     9),
  (2, 'pending',     'confirmed',    1),
  (2, 'confirmed',   'in_progress',  5),
  (3, NULL, 'pending',     10);

SET FOREIGN_KEY_CHECKS = 1;