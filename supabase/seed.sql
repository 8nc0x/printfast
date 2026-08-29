-- Seed the single MVP shop + its pricing settings.
-- Run after migrations. The shop owner user is created via the app (register as shop_owner)
-- then linked here, or update owner_id manually.

insert into shops (id, name, address, is_active)
values ('00000000-0000-0000-0000-000000000001', 'Campus Print Shop', 'Main Gate, College Campus', true)
on conflict (id) do nothing;

insert into shop_settings (shop_id, price_bw_page, price_color_page, paper_multiplier, binding_price, currency)
values (
  '00000000-0000-0000-0000-000000000001',
  2.00, 10.00,
  '{"A4":1,"A3":2}',
  '{"none":0,"staple":5,"spiral":30}',
  'INR'
)
on conflict (shop_id) do nothing;
