

'use strict';

const { pool } = require('../../config/db');
const { AppError } = require('../../middlewares/error.middleware');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');

function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function ensureUniqueSlug(table, slug, excludeId = null) {
  let candidate = slug;
  let suffix = 2;
  while (true) {
    const query = excludeId
      ? `SELECT id FROM ${table} WHERE slug = ? AND id != ? LIMIT 1`
      : `SELECT id FROM ${table} WHERE slug = ? LIMIT 1`;
    const params = excludeId ? [candidate, excludeId] : [candidate];
    const [rows] = await pool.execute(query, params);
    if (!rows.length) return candidate;
    candidate = `${slug}-${suffix++}`;
  }
}


const categoryService = {
  async create(data) {
    const slug = await ensureUniqueSlug(
      'categories',
      data.slug || generateSlug(data.name)
    );

    const [result] = await pool.execute(
      `INSERT INTO categories (name, slug, description, image_url, display_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        slug,
        data.description  || null,
        data.image_url    || null,
        data.display_order ?? 0,
        data.is_active !== false ? 1 : 0,
      ]
    );

    return categoryService.getById(result.insertId, true);
  },

  async getAll(onlyActive = false) {
    const whereClause = onlyActive ? 'WHERE is_active = 1' : '';
    const [rows] = await pool.execute(
      `SELECT id, uuid, name, slug, description, image_url, display_order, is_active,
              created_at, updated_at
         FROM categories
         ${whereClause}
         ORDER BY display_order ASC, name ASC`
    );
    return rows;
  },

  async getById(id, byPrimaryKey = false) {
    const col = byPrimaryKey ? 'id' : 'uuid';
    const [rows] = await pool.execute(
      `SELECT id, uuid, name, slug, description, image_url, display_order, is_active,
              created_at, updated_at
         FROM categories WHERE ${col} = ? LIMIT 1`,
      [id]
    );
    if (!rows.length) throw new AppError('Category not found.', 404, 'NOT_FOUND');
    return rows[0];
  },

  async update(uuid, data) {
    const category = await categoryService.getById(uuid);
    const fields = [];
    const values = [];

    if (data.name !== undefined)         { fields.push('name = ?');          values.push(data.name); }
    if (data.slug !== undefined) {
      const slug = await ensureUniqueSlug('categories', data.slug, category.id);
      fields.push('slug = ?'); values.push(slug);
    }
    if (data.description !== undefined)  { fields.push('description = ?');   values.push(data.description); }
    if (data.image_url !== undefined)    { fields.push('image_url = ?');      values.push(data.image_url); }
    if (data.display_order !== undefined){ fields.push('display_order = ?'); values.push(data.display_order); }
    if (data.is_active !== undefined)    { fields.push('is_active = ?');      values.push(data.is_active ? 1 : 0); }

    values.push(category.id);
    await pool.execute(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, values);
    return categoryService.getById(category.id, true);
  },

  async delete(uuid) {
    const category = await categoryService.getById(uuid);

    const [products] = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM products WHERE category_id = ?',
      [category.id]
    );
    if (products[0].cnt > 0) {
      throw new AppError(
        'Cannot delete category — it has products assigned to it. Deactivate it instead.',
        409,
        'CATEGORY_HAS_PRODUCTS'
      );
    }

    await pool.execute('DELETE FROM categories WHERE id = ?', [category.id]);
    return { deleted: true };
  },
};


const productService = {
  async create(data) {
    const [catRows] = await pool.execute(
      'SELECT id FROM categories WHERE id = ? LIMIT 1',
      [data.category_id]
    );
    if (!catRows.length) throw new AppError('Category not found.', 404, 'NOT_FOUND');

    const slug = await ensureUniqueSlug(
      'products',
      data.slug || generateSlug(data.name)
    );

    const [result] = await pool.execute(
      `INSERT INTO products
         (category_id, name, slug, description, product_type, base_price,
          image_url, is_customizable, is_available_kiosk, is_available_d2c,
          is_active, display_order, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.category_id,
        data.name,
        slug,
        data.description        || null,
        data.product_type,
        data.base_price,
        data.image_url          || null,
        data.is_customizable    ? 1 : 0,
        data.is_available_kiosk !== false ? 1 : 0,
        data.is_available_d2c   ? 1 : 0,
        data.is_active          !== false ? 1 : 0,
        data.display_order      ?? 0,
        data.meta               ? JSON.stringify(data.meta) : null,
      ]
    );

    return productService.getById(result.insertId, true);
  },

  async getList(query) {
    const { page, limit, offset } = parsePagination(query);
    const lim = parseInt(limit,  10);
    const off = parseInt(offset, 10);

    const conditions = [];
    const params     = [];

    if (query.category_id)              { conditions.push('p.category_id = ?');        params.push(query.category_id); }
    if (query.product_type)             { conditions.push('p.product_type = ?');        params.push(query.product_type); }
    if (query.is_active !== undefined)  { conditions.push('p.is_active = ?');           params.push(query.is_active ? 1 : 0); }
    if (query.is_available_kiosk !== undefined) {
      conditions.push('p.is_available_kiosk = ?');
      params.push(query.is_available_kiosk ? 1 : 0);
    }
    if (query.is_available_d2c !== undefined) {
      conditions.push('p.is_available_d2c = ?');
      params.push(query.is_available_d2c ? 1 : 0);
    }
    if (query.search) {
      conditions.push('(p.name LIKE ? OR p.description LIKE ?)');
      const term = `%${query.search}%`;
      params.push(term, term);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM products p ${where}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT p.id, p.uuid, p.name, p.slug, p.description, p.product_type,
              p.base_price, p.image_url, p.is_customizable,
              p.is_available_kiosk, p.is_available_d2c, p.is_active,
              p.display_order, p.meta,
              c.id AS category_id, c.name AS category_name
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         ${where}
         ORDER BY p.display_order ASC, p.name ASC
         LIMIT ${lim} OFFSET ${off}`,
      params
    );

    return {
      products: rows.map(formatProduct),
      meta: buildPaginationMeta(countRows[0].total, page, limit),
    };
  },

  async getById(id, byPrimaryKey = false) {
    const col = byPrimaryKey ? 'p.id' : 'p.uuid';
    const [rows] = await pool.execute(
      `SELECT p.id, p.uuid, p.name, p.slug, p.description, p.product_type,
              p.base_price, p.image_url, p.is_customizable,
              p.is_available_kiosk, p.is_available_d2c, p.is_active,
              p.display_order, p.meta, p.created_at, p.updated_at,
              c.id AS category_id, c.name AS category_name, c.slug AS category_slug
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE ${col} = ? LIMIT 1`,
      [id]
    );
    if (!rows.length) throw new AppError('Product not found.', 404, 'NOT_FOUND');
    return formatProduct(rows[0]);
  },

  async update(uuid, data) {
    const product = await productService.getById(uuid);

    if (data.category_id) {
      const [catRows] = await pool.execute(
        'SELECT id FROM categories WHERE id = ? LIMIT 1',
        [data.category_id]
      );
      if (!catRows.length) throw new AppError('Category not found.', 404, 'NOT_FOUND');
    }

    const fields = [];
    const values = [];

    const mappings = [
      ['category_id',   data.category_id],
      ['name',          data.name],
      ['description',   data.description],
      ['product_type',  data.product_type],
      ['base_price',    data.base_price],
      ['image_url',     data.image_url],
      ['display_order', data.display_order],
    ];
    for (const [col, val] of mappings) {
      if (val !== undefined) { fields.push(`${col} = ?`); values.push(val); }
    }

    const booleans = [
      ['is_customizable',    data.is_customizable],
      ['is_available_kiosk', data.is_available_kiosk],
      ['is_available_d2c',   data.is_available_d2c],
      ['is_active',          data.is_active],
    ];
    for (const [col, val] of booleans) {
      if (val !== undefined) { fields.push(`${col} = ?`); values.push(val ? 1 : 0); }
    }

    if (data.slug !== undefined) {
      const slug = await ensureUniqueSlug('products', data.slug, product.id);
      fields.push('slug = ?'); values.push(slug);
    }
    if (data.meta !== undefined) {
      fields.push('meta = ?');
      values.push(data.meta ? JSON.stringify(data.meta) : null);
    }

    values.push(product.id);
    await pool.execute(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, values);
    return productService.getById(product.id, true);
  },

  async delete(uuid) {
    const product = await productService.getById(uuid);

    const [orderCheck] = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM order_items WHERE product_id = ?',
      [product.id]
    );
    if (orderCheck[0].cnt > 0) {
      throw new AppError(
        'Cannot delete product — it has order history. Set is_active = false instead.',
        409,
        'PRODUCT_HAS_ORDERS'
      );
    }

    await pool.execute('DELETE FROM products WHERE id = ?', [product.id]);
    return { deleted: true };
  },

 
  async getMenu(query) {
    const conditions = ['p.is_active = 1'];
    const params     = [];

    if (query.channel === 'kiosk') {
      conditions.push('p.is_available_kiosk = 1');
    } else if (query.channel === 'd2c_website') {
      conditions.push('p.is_available_d2c = 1');
    }

    if (query.category_id) {
      conditions.push('p.category_id = ?');
      params.push(query.category_id);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [rows] = await pool.query(
      `SELECT
         c.id AS cat_id, c.uuid AS cat_uuid, c.name AS cat_name,
         c.slug AS cat_slug, c.image_url AS cat_image, c.display_order AS cat_order,
         p.id, p.uuid, p.name, p.slug, p.description, p.product_type,
         p.base_price, p.image_url, p.is_customizable, p.display_order
       FROM products p
       JOIN categories c ON c.id = p.category_id AND c.is_active = 1
       ${where}
       ORDER BY c.display_order ASC, c.name ASC, p.display_order ASC, p.name ASC`,
      params
    );

    // Group products by category
    const categoryMap = new Map();
    for (const row of rows) {
      if (!categoryMap.has(row.cat_id)) {
        categoryMap.set(row.cat_id, {
          id:            row.cat_uuid,
          name:          row.cat_name,
          slug:          row.cat_slug,
          image_url:     row.cat_image,
          display_order: row.cat_order,
          products:      [],
        });
      }
      categoryMap.get(row.cat_id).products.push({
        id:              row.uuid,
        name:            row.name,
        slug:            row.slug,
        description:     row.description,
        product_type:    row.product_type,
        base_price:      parseFloat(row.base_price),
        image_url:       row.image_url,
        is_customizable: Boolean(row.is_customizable),
        display_order:   row.display_order,
      });
    }

    return Array.from(categoryMap.values());
  },
};

// ─── Format helper ─────────────────────────────────────────────────────────────

function formatProduct(row) {
  return {
    id:                 row.uuid,
    name:               row.name,
    slug:               row.slug,
    description:        row.description,
    product_type:       row.product_type,
    base_price:         parseFloat(row.base_price),
    image_url:          row.image_url,
    is_customizable:    Boolean(row.is_customizable),
    is_available_kiosk: Boolean(row.is_available_kiosk),
    is_available_d2c:   Boolean(row.is_available_d2c),
    is_active:          Boolean(row.is_active),
    display_order:      row.display_order,
    meta:               row.meta || null,
    category:           row.category_id
      ? { id: row.category_id, name: row.category_name, slug: row.category_slug || undefined }
      : null,
    created_at:  row.created_at,
    updated_at:  row.updated_at,
  };
}

module.exports = { categoryService, productService };