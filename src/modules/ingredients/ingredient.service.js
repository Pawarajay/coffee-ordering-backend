


'use strict';

const { pool } = require('../../config/db');
const { AppError } = require('../../middlewares/error.middleware');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const { v4: uuidv4 } = require('uuid');


const ingredientService = {
  async create(data) {
    const [result] = await pool.execute(
      `INSERT INTO ingredients
         (uuid, name, unit, cost_per_unit, low_stock_threshold, critical_stock_threshold, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        data.name,
        data.unit,
        data.cost_per_unit,
        data.low_stock_threshold ?? 100,
        data.critical_stock_threshold ?? 20,
        data.is_active !== false ? 1 : 0,
      ]
    );
    return ingredientService.getById(result.insertId, true);
  },

  async getList(query) {
    const { page, limit, offset } = parsePagination(query);
    const lim = parseInt(limit,  10);
    const off = parseInt(offset, 10);
    const conditions = [];
    const params     = [];

    if (query.is_active !== undefined) {
      conditions.push('is_active = ?');
      params.push(query.is_active ? 1 : 0);
    }
    if (query.search) {
      conditions.push('name LIKE ?');
      params.push(`%${query.search}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM ingredients ${where}`, params
    );

    const [rows] = await pool.query(
      `SELECT id, uuid, name, unit, cost_per_unit,
              low_stock_threshold, critical_stock_threshold, is_active,
              created_at, updated_at
         FROM ingredients ${where}
         ORDER BY name ASC
         LIMIT ${lim} OFFSET ${off}`,
      params
    );

    return {
      ingredients: rows.map(formatIngredient),
      meta: buildPaginationMeta(countRows[0].total, page, limit),
    };
  },

  async getById(id, byPrimaryKey = false) {
    const col = byPrimaryKey ? 'id' : 'uuid';
    const [rows] = await pool.execute(
      `SELECT id, uuid, name, unit, cost_per_unit,
              low_stock_threshold, critical_stock_threshold, is_active,
              created_at, updated_at
         FROM ingredients WHERE ${col} = ? LIMIT 1`,
      [id]
    );
    if (!rows.length) throw new AppError('Ingredient not found.', 404, 'NOT_FOUND');
    return formatIngredient(rows[0]);
  },

  async update(uuid, data) {
    const ingredient = await ingredientService.getById(uuid);
    const fields = [];
    const values = [];

    const map = [
      ['name', data.name],
      ['unit', data.unit],
      ['cost_per_unit', data.cost_per_unit],
      ['low_stock_threshold', data.low_stock_threshold],
      ['critical_stock_threshold', data.critical_stock_threshold],
    ];
    for (const [col, val] of map) {
      if (val !== undefined) { fields.push(`${col} = ?`); values.push(val); }
    }
    if (data.is_active !== undefined) {
      fields.push('is_active = ?'); values.push(data.is_active ? 1 : 0);
    }

    values.push(ingredient.id);
    await pool.execute(`UPDATE ingredients SET ${fields.join(', ')} WHERE id = ?`, values);
    return ingredientService.getById(ingredient.id, true);
  },

  async delete(uuid) {
    const ingredient = await ingredientService.getById(uuid);

    const [mapped] = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM ingredient_mappings WHERE ingredient_id = ?',
      [ingredient.id]
    );
    if (mapped[0].cnt > 0) {
      throw new AppError(
        'Cannot delete — ingredient is mapped to products. Remove mappings first.',
        409, 'INGREDIENT_IN_USE'
      );
    }

    await pool.execute('DELETE FROM ingredients WHERE id = ?', [ingredient.id]);
    return { deleted: true };
  },
};


const ingredientGroupService = {
  async create(data) {
    const [result] = await pool.execute(
      `INSERT INTO ingredient_groups
         (uuid, name, description, selection_type, is_required, display_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        data.name,
        data.description    || null,
        data.selection_type || 'single',
        data.is_required    ? 1 : 0,
        data.display_order  ?? 0,
        data.is_active      !== false ? 1 : 0,
      ]
    );
    return ingredientGroupService.getById(result.insertId, true);
  },

  async getAll() {
    const [rows] = await pool.execute(
      `SELECT id, uuid, name, description, selection_type, is_required, display_order, is_active
         FROM ingredient_groups
         ORDER BY display_order ASC, name ASC`
    );
    return rows.map((r) => ({
      ...r,
      is_required: Boolean(r.is_required),
      is_active:   Boolean(r.is_active),
    }));
  },

  async getById(id, byPrimaryKey = false) {
    const col = byPrimaryKey ? 'id' : 'uuid';
    const [rows] = await pool.execute(
      `SELECT id, uuid, name, description, selection_type, is_required, display_order, is_active
         FROM ingredient_groups WHERE ${col} = ? LIMIT 1`,
      [id]
    );
    if (!rows.length) throw new AppError('Ingredient group not found.', 404, 'NOT_FOUND');
    return { ...rows[0], is_required: Boolean(rows[0].is_required), is_active: Boolean(rows[0].is_active) };
  },

  async update(uuid, data) {
    const group = await ingredientGroupService.getById(uuid);
    const fields = [];
    const values = [];

    const map = [
      ['name',           data.name],
      ['description',    data.description],
      ['selection_type', data.selection_type],
      ['display_order',  data.display_order],
    ];
    for (const [col, val] of map) {
      if (val !== undefined) { fields.push(`${col} = ?`); values.push(val); }
    }
    if (data.is_required !== undefined) { fields.push('is_required = ?'); values.push(data.is_required ? 1 : 0); }
    if (data.is_active   !== undefined) { fields.push('is_active = ?');   values.push(data.is_active   ? 1 : 0); }

    values.push(group.id);
    await pool.execute(`UPDATE ingredient_groups SET ${fields.join(', ')} WHERE id = ?`, values);
    return ingredientGroupService.getById(group.id, true);
  },

  async delete(uuid) {
    const group = await ingredientGroupService.getById(uuid);

    const [mapped] = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM ingredient_mappings WHERE group_id = ?',
      [group.id]
    );
    if (mapped[0].cnt > 0) {
      throw new AppError(
        'Cannot delete — group has active ingredient mappings. Deactivate it instead.',
        409, 'GROUP_IN_USE'
      );
    }

    await pool.execute('DELETE FROM ingredient_groups WHERE id = ?', [group.id]);
    return { deleted: true };
  },
};


const ingredientMappingService = {
  async getByProduct(productUuid) {
    const [productRows] = await pool.execute(
      'SELECT id, uuid, name, base_price FROM products WHERE uuid = ? LIMIT 1',
      [productUuid]
    );
    if (!productRows.length) throw new AppError('Product not found.', 404, 'NOT_FOUND');
    const product = productRows[0];

    const [rows] = await pool.execute(
      `SELECT
         im.id, im.ingredient_id, im.group_id,
         im.quantity, im.is_default, im.is_optional,
         im.price_override, im.min_qty, im.max_qty, im.step_qty,
         i.uuid AS ingredient_uuid, i.name AS ingredient_name,
         i.unit, i.cost_per_unit,
         ig.uuid AS group_uuid, ig.name AS group_name,
         ig.selection_type, ig.is_required
       FROM ingredient_mappings im
       JOIN ingredients i ON i.id = im.ingredient_id
       LEFT JOIN ingredient_groups ig ON ig.id = im.group_id
       WHERE im.product_id = ?
       ORDER BY ig.display_order ASC, im.is_default DESC`,
      [product.id]
    );

    return {
      product: { id: product.uuid, name: product.name, base_price: parseFloat(product.base_price) },
      mappings: rows.map(formatMapping),
    };
  },

  async addMapping(productUuid, data) {
    const [productRows] = await pool.execute(
      'SELECT id FROM products WHERE uuid = ? LIMIT 1', [productUuid]
    );
    if (!productRows.length) throw new AppError('Product not found.', 404, 'NOT_FOUND');
    const productId = productRows[0].id;

    const [ingRows] = await pool.execute(
      'SELECT id FROM ingredients WHERE id = ? LIMIT 1', [data.ingredient_id]
    );
    if (!ingRows.length) throw new AppError('Ingredient not found.', 404, 'NOT_FOUND');

    const [dupRows] = await pool.execute(
      'SELECT id FROM ingredient_mappings WHERE product_id = ? AND ingredient_id = ? LIMIT 1',
      [productId, data.ingredient_id]
    );
    if (dupRows.length) {
      throw new AppError('This ingredient is already mapped to the product.', 409, 'DUPLICATE_MAPPING');
    }

    await pool.execute(
      `INSERT INTO ingredient_mappings
         (product_id, ingredient_id, group_id, quantity, is_default,
          is_optional, price_override, min_qty, max_qty, step_qty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId,
        data.ingredient_id,
        data.group_id       || null,
        data.quantity,
        data.is_default     !== false ? 1 : 0,
        data.is_optional    ? 1 : 0,
        data.price_override ?? null,
        data.min_qty        ?? 0,
        data.max_qty        ?? null,
        data.step_qty       ?? 1,
      ]
    );

    return ingredientMappingService.getByProduct(productUuid);
  },

  async updateMapping(productUuid, ingredientId, data) {
    const [productRows] = await pool.execute(
      'SELECT id FROM products WHERE uuid = ? LIMIT 1', [productUuid]
    );
    if (!productRows.length) throw new AppError('Product not found.', 404, 'NOT_FOUND');
    const productId = productRows[0].id;

    const [mapRows] = await pool.execute(
      'SELECT id FROM ingredient_mappings WHERE product_id = ? AND ingredient_id = ? LIMIT 1',
      [productId, ingredientId]
    );
    if (!mapRows.length) throw new AppError('Mapping not found.', 404, 'NOT_FOUND');

    const fields = [];
    const values = [];

    const map = [
      ['group_id',       data.group_id],
      ['quantity',       data.quantity],
      ['price_override', data.price_override],
      ['min_qty',        data.min_qty],
      ['max_qty',        data.max_qty],
      ['step_qty',       data.step_qty],
    ];
    for (const [col, val] of map) {
      if (val !== undefined) { fields.push(`${col} = ?`); values.push(val); }
    }
    if (data.is_default  !== undefined) { fields.push('is_default = ?');  values.push(data.is_default  ? 1 : 0); }
    if (data.is_optional !== undefined) { fields.push('is_optional = ?'); values.push(data.is_optional ? 1 : 0); }

    values.push(mapRows[0].id);
    await pool.execute(`UPDATE ingredient_mappings SET ${fields.join(', ')} WHERE id = ?`, values);
    return ingredientMappingService.getByProduct(productUuid);
  },

  async removeMapping(productUuid, ingredientId) {
    const [productRows] = await pool.execute(
      'SELECT id FROM products WHERE uuid = ? LIMIT 1', [productUuid]
    );
    if (!productRows.length) throw new AppError('Product not found.', 404, 'NOT_FOUND');

    const [result] = await pool.execute(
      'DELETE FROM ingredient_mappings WHERE product_id = ? AND ingredient_id = ?',
      [productRows[0].id, ingredientId]
    );
    if (result.affectedRows === 0) throw new AppError('Mapping not found.', 404, 'NOT_FOUND');
    return { deleted: true };
  },

  async bulkSet(productUuid, ingredients) {
    const [productRows] = await pool.execute(
      'SELECT id FROM products WHERE uuid = ? LIMIT 1', [productUuid]
    );
    if (!productRows.length) throw new AppError('Product not found.', 404, 'NOT_FOUND');
    const productId = productRows[0].id;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute('DELETE FROM ingredient_mappings WHERE product_id = ?', [productId]);

      for (const ing of ingredients) {
        await connection.execute(
          `INSERT INTO ingredient_mappings
             (product_id, ingredient_id, group_id, quantity, is_default,
              is_optional, price_override, min_qty, max_qty, step_qty)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            productId,
            ing.ingredient_id,
            ing.group_id       || null,
            ing.quantity,
            ing.is_default     !== false ? 1 : 0,
            ing.is_optional    ? 1 : 0,
            ing.price_override ?? null,
            ing.min_qty        ?? 0,
            ing.max_qty        ?? null,
            ing.step_qty       ?? 1,
          ]
        );
      }

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    return ingredientMappingService.getByProduct(productUuid);
  },

  async calculatePrice(productId, selections) {
    const [productRows] = await pool.execute(
      'SELECT id, base_price FROM products WHERE id = ? LIMIT 1', [productId]
    );
    if (!productRows.length) throw new AppError('Product not found.', 404, 'NOT_FOUND');
    const basePrice = parseFloat(productRows[0].base_price);

    let ingredientCost = 0;
    const breakdown    = [];

    for (const sel of selections) {
      const [rows] = await pool.execute(
        `SELECT im.quantity AS default_qty, im.price_override,
                i.cost_per_unit, i.name, i.unit
           FROM ingredient_mappings im
           JOIN ingredients i ON i.id = im.ingredient_id
          WHERE im.product_id = ? AND im.ingredient_id = ? LIMIT 1`,
        [productId, sel.ingredient_id]
      );

      if (!rows.length) {
        throw new AppError(
          `Ingredient ID ${sel.ingredient_id} is not valid for this product.`,
          400, 'INVALID_INGREDIENT'
        );
      }

      const row      = rows[0];
      const linePrice = row.price_override !== null
        ? parseFloat(row.price_override)
        : parseFloat(row.cost_per_unit) * sel.quantity;

      ingredientCost += linePrice;
      breakdown.push({
        ingredient_id: sel.ingredient_id,
        name:          row.name,
        unit:          row.unit,
        quantity:      sel.quantity,
        unit_price:    row.price_override !== null ? parseFloat(row.price_override) : parseFloat(row.cost_per_unit),
        line_price:    parseFloat(linePrice.toFixed(2)),
      });
    }

    return {
      base_price:      basePrice,
      ingredient_cost: parseFloat(ingredientCost.toFixed(2)),
      total_price:     parseFloat((basePrice + ingredientCost).toFixed(2)),
      breakdown,
    };
  },

  async previewPrice(productUuid, selections) {
    const [productRows] = await pool.execute(
      'SELECT id, uuid, name, base_price, is_customizable FROM products WHERE uuid = ? LIMIT 1',
      [productUuid]
    );
    if (!productRows.length) throw new AppError('Product not found.', 404, 'NOT_FOUND');
    const product = productRows[0];

    if (!product.is_customizable) {
      throw new AppError('This product does not support customization.', 400, 'NOT_CUSTOMIZABLE');
    }

    const pricing = await ingredientMappingService.calculatePrice(product.id, selections);

    return {
      product: {
        id:         product.uuid,
        name:       product.name,
        base_price: parseFloat(product.base_price),
      },
      ...pricing,
    };
  },
};


function formatIngredient(row) {
  return {
    id:                       row.uuid,
    name:                     row.name,
    unit:                     row.unit,
    cost_per_unit:            parseFloat(row.cost_per_unit),
    low_stock_threshold:      parseFloat(row.low_stock_threshold),
    critical_stock_threshold: parseFloat(row.critical_stock_threshold),
    is_active:                Boolean(row.is_active),
    created_at:               row.created_at,
    updated_at:               row.updated_at,
  };
}

function formatMapping(row) {
  const effectivePrice = row.price_override !== null
    ? parseFloat(row.price_override)
    : parseFloat(row.cost_per_unit) * parseFloat(row.quantity);

  return {
    ingredient: {
      id:            row.ingredient_uuid,
      name:          row.ingredient_name,
      unit:          row.unit,
      cost_per_unit: parseFloat(row.cost_per_unit),
    },
    group: row.group_uuid
      ? {
          id:             row.group_uuid,
          name:           row.group_name,
          selection_type: row.selection_type,
          is_required:    Boolean(row.is_required),
        }
      : null,
    quantity:        parseFloat(row.quantity),
    is_default:      Boolean(row.is_default),
    is_optional:     Boolean(row.is_optional),
    price_override:  row.price_override !== null ? parseFloat(row.price_override) : null,
    effective_price: parseFloat(effectivePrice.toFixed(4)),
    min_qty:         parseFloat(row.min_qty),
    max_qty:         row.max_qty !== null ? parseFloat(row.max_qty) : null,
    step_qty:        parseFloat(row.step_qty),
  };
}

module.exports = {
  ingredientService,
  ingredientGroupService,
  ingredientMappingService,
};