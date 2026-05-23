ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER email;

-- Insert or Update Admin
INSERT INTO users (uuid, mobile, name, email, password_hash, role, is_active)
VALUES (UUID(), '9999999991', 'Super Admin', 'admin@example.com', '$2a$10$lPJfwRbLE4r1cBoWOlUDsOfB5Ts8Ek6rgXawvjaUU3Mchfxzg33Nm', 'super_admin', 1)
ON DUPLICATE KEY UPDATE 
  password_hash = '$2a$10$lPJfwRbLE4r1cBoWOlUDsOfB5Ts8Ek6rgXawvjaUU3Mchfxzg33Nm',
  email = 'admin@example.com',
  role = 'super_admin';

-- Insert or Update Barista / Kitchen
INSERT INTO users (uuid, mobile, name, email, password_hash, role, is_active)
VALUES (UUID(), '9999999992', 'Kitchen Staff', 'bianchi@gmail.com', '$2a$10$lPJfwRbLE4r1cBoWOlUDsOfB5Ts8Ek6rgXawvjaUU3Mchfxzg33Nm', 'barista', 1)
ON DUPLICATE KEY UPDATE 
  password_hash = '$2a$10$lPJfwRbLE4r1cBoWOlUDsOfB5Ts8Ek6rgXawvjaUU3Mchfxzg33Nm',
  email = 'bianchi@gmail.com',
  role = 'barista';

-- Insert or Update Kiosk / Store Manager
INSERT INTO users (uuid, mobile, name, email, password_hash, role, is_active)
VALUES (UUID(), '9999999993', 'Customer Display', 'counter@gmail.com', '$2a$10$lPJfwRbLE4r1cBoWOlUDsOfB5Ts8Ek6rgXawvjaUU3Mchfxzg33Nm', 'store_manager', 1)
ON DUPLICATE KEY UPDATE 
  password_hash = '$2a$10$lPJfwRbLE4r1cBoWOlUDsOfB5Ts8Ek6rgXawvjaUU3Mchfxzg33Nm',
  email = 'counter@gmail.com',
  role = 'store_manager';
