-- F-09 (F09-D11, SDS 4.3): category and item type names are unique without regard to case
-- (F09-D2), so "Robotics" and "robotics" cannot both be stored, also when created at the same
-- moment. Hand-written: Prisma cannot express an index on lower(name). The Sprint 1 seed names are
-- already unique without regard to case, so these apply to existing data.
CREATE UNIQUE INDEX categories_lower_name_key ON categories (lower(name));
CREATE UNIQUE INDEX item_types_lower_name_key ON item_types (lower(name));
