import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**

* ============================================================================
* TARGET
* ============================================================================
*
* Это ЦЕЛЕВОЙ безопасный скрипт для списания текущего просроченного
* остатка партии #15 товара Творог.
*
* ВАЖНО:
* У партии #15 уже существует историческое списание:
*
* Movement #127
* quantity = -15
* comment  = "Списание. Партия №15"
*
* Это НЕ является причиной для отказа.
*
* После этого исторического списания из заказов были сделаны возвраты,
* которые восстановили 3 штуки обратно в Batch #15.
*
* Поэтому сейчас:
*
* Batch #15 = 3 шт.
* status   = EXPIRED
*
* Эти 3 штуки являются новым физическим остатком и должны быть списаны
* отдельным WRITE_OFF.
*
* ============================================================================
* SAFETY MODEL
* ============================================================================
*
* Скрипт:
*
* 1. Ничего не делает до прохождения всех проверок.
* 2. Проверяет историческое WRITE_OFF.
* 3. Проверяет возвраты ПОСЛЕ исторического WRITE_OFF.
* 4. Проверяет, что текущие 3 шт. объясняются этими возвратами.
* 5. Использует уникальный marker для нового списания.
* 6. Повторный запуск после успешного выполнения будет ABORTED.
* 7. Все изменения выполняются в одной Prisma transaction.
*
* ============================================================================
  */

const TARGET_PRODUCT_ID = 2;
const TARGET_BATCH_ID = 15;
const EXPECTED_CURRENT_QUANTITY = 3;

const NEW_WRITE_OFF_MARKER =
"Списание текущего просроченного остатка после возвратов. Партия №15";

/**

* Historical write-off marker.
*
* Мы ищем старое списание только для доказательства того,
* что текущие 3 шт. появились после него.
  */
  const HISTORICAL_WRITE_OFF_MARKER = "Партия №15";

async function main() {
console.log("");
console.log("==============================================================================");
console.log("APPLY EXPIRED STOCK WRITE-OFF");
console.log("TARGET: PRODUCT #2 / BATCH #15");
console.log("STRICT TARGETED REPAIR");
console.log("==============================================================================");
console.log("");

console.log(`Target Product #${TARGET_PRODUCT_ID}`);
console.log(`Target Batch #${TARGET_BATCH_ID}`);
console.log(`Expected current quantity=${EXPECTED_CURRENT_QUANTITY}`);
console.log("");

// ===========================================================================
// 1. PRE-FLIGHT LOAD
// ===========================================================================

console.log("1. PRE-FLIGHT CHECK");
console.log("------------------------------------------------------------------------------");

const targetBatch = await prisma.batch.findUnique({
where: {
id: TARGET_BATCH_ID,
},
include: {
product: true,
},
});

if (!targetBatch) {
throw new Error(
`Batch #${TARGET_BATCH_ID} NOT FOUND. ABORTED.`
);
}

if (targetBatch.productId !== TARGET_PRODUCT_ID) {
throw new Error(
`Batch #${TARGET_BATCH_ID} belongs to Product #${targetBatch.productId}, ` +
`expected Product #${TARGET_PRODUCT_ID}. ABORTED.`
);
}

if (targetBatch.product.id !== TARGET_PRODUCT_ID) {
throw new Error(
`Batch #${TARGET_BATCH_ID} product relation is inconsistent. ABORTED.`
);
}

console.log(
`Product #${targetBatch.product.id} "${targetBatch.product.name}"`
);

console.log(
`Batch #${targetBatch.id} | ` +
`quantity=${targetBatch.quantity} | ` +
`status=${targetBatch.status} | ` +
`purchaseCost=${targetBatch.purchaseCost} | ` +
`receivedAt=${targetBatch.receivedAt.toISOString()} | ` +
`expiryDate=${targetBatch.expiryDate.toISOString()}`
);

console.log(
`Product.stock=${targetBatch.product.stock}`
);

console.log("");

// ===========================================================================
// 2. CHECK CURRENT BATCH STATE
// ===========================================================================

console.log("2. CURRENT BATCH STATE");
console.log("------------------------------------------------------------------------------");

if (targetBatch.quantity !== EXPECTED_CURRENT_QUANTITY) {
throw new Error(
`Batch #${TARGET_BATCH_ID} current quantity=${targetBatch.quantity}, ` +
`expected exactly ${EXPECTED_CURRENT_QUANTITY}. ABORTED.`
);
}

if (targetBatch.quantity <= 0) {
throw new Error(
`Batch #${TARGET_BATCH_ID} has no positive quantity. ABORTED.`
);
}

if (targetBatch.status !== "EXPIRED") {
throw new Error(
`Batch #${TARGET_BATCH_ID} status=${targetBatch.status}, ` +
`expected EXPIRED. ABORTED.`
);
}

const now = new Date();

if (targetBatch.expiryDate >= now) {
throw new Error(
`Batch #${TARGET_BATCH_ID} expiryDate=${targetBatch.expiryDate.toISOString()} ` +
`is not in the past. ABORTED.`
);
}

console.log("🟢 Current quantity check: PASSED");
console.log("🟢 Status EXPIRED check: PASSED");
console.log("🟢 Expiry date check: PASSED");
console.log("");

// ===========================================================================
// 3. CHECK PRODUCT / BATCH STOCK CONSISTENCY
// ===========================================================================

console.log("3. PRODUCT / BATCH STOCK CONSISTENCY");
console.log("------------------------------------------------------------------------------");

const productBatchAggregate = await prisma.batch.aggregate({
where: {
productId: TARGET_PRODUCT_ID,
},
_sum: {
quantity: true,
},
});

const totalBatchQuantity =
productBatchAggregate._sum.quantity ?? 0;

console.log(
`Product.stock=${targetBatch.product.stock}`
);

console.log(
`SUM(Batch.quantity)=${totalBatchQuantity}`
);

if (targetBatch.product.stock !== totalBatchQuantity) {
throw new Error(
`Product #${TARGET_PRODUCT_ID} stock mismatch: ` +
`Product.stock=${targetBatch.product.stock}, ` +
`SUM(Batch.quantity)=${totalBatchQuantity}. ABORTED.`
);
}

console.log("🟢 Product.stock == SUM(Batch.quantity)");
console.log("");

// ===========================================================================
// 4. FIND HISTORICAL WRITE-OFF
// ===========================================================================

console.log("4. HISTORICAL WRITE-OFF CHECK");
console.log("------------------------------------------------------------------------------");

/**

* Movement does not contain batchId in the current schema.
*
* Therefore the batch is identified through the historical comment.
*
* We intentionally DO NOT reject merely because such a movement exists.
* Its existence is expected.
  */
  const historicalWriteOffs = await prisma.movement.findMany({
  where: {
  productId: TARGET_PRODUCT_ID,
  type: "WRITE_OFF",
  quantity: {
  lt: 0,
  },
  comment: {
  contains: HISTORICAL_WRITE_OFF_MARKER,
  },
  },
  orderBy: {
  createdAt: "desc",
  },
  });

if (historicalWriteOffs.length === 0) {
throw new Error(
`No historical WRITE_OFF found for Product #${TARGET_PRODUCT_ID} ` +
`referencing Batch #${TARGET_BATCH_ID}. ` +
`The post-write-off return history cannot be proven. ABORTED.`
);
}

const historicalWriteOff = historicalWriteOffs[0];

console.log(
`Historical WRITE_OFF found: Movement #${historicalWriteOff.id}`
);

console.log(
`quantity=${historicalWriteOff.quantity} | ` +
`comment=${historicalWriteOff.comment} | ` +
`createdAt=${historicalWriteOff.createdAt.toISOString()}`
);

console.log("");

// ===========================================================================
// 5. CHECK WHETHER NEW CURRENT WRITE-OFF ALREADY EXISTS
// ===========================================================================

console.log("5. DUPLICATE CURRENT WRITE-OFF CHECK");
console.log("------------------------------------------------------------------------------");

/**

* We only reject our OWN current cleanup marker.
*
* We intentionally ignore the old generic:
*
* "Списание. Партия №15"
*
* because that is historical and happened before the returns.
  */
  const existingCurrentWriteOff = await prisma.movement.findFirst({
  where: {
  productId: TARGET_PRODUCT_ID,
  type: "WRITE_OFF",
  quantity: {
  lt: 0,
  },
  comment: NEW_WRITE_OFF_MARKER,
  },
  });

if (existingCurrentWriteOff) {
throw new Error(
`Current expired-stock write-off already exists: ` +
`Movement #${existingCurrentWriteOff.id} ` +
`(quantity=${existingCurrentWriteOff.quantity}). ` +
`Refusing duplicate write-off. ABORTED.`
);
}

console.log(
"🟢 No previous current-cleanup WRITE_OFF found."
);
console.log("");

// ===========================================================================
// 6. FIND RETURNS AFTER HISTORICAL WRITE-OFF
// ===========================================================================

console.log("6. RETURNS AFTER HISTORICAL WRITE-OFF");
console.log("------------------------------------------------------------------------------");

/**

* These ReturnBatch records are the critical evidence.
*
* The old -15 write-off happened first.
* Later returns restored stock into Batch #15.
*
* Current Batch #15 quantity=3 must therefore be explained by
* post-write-off returns.
  */
  const postWriteOffReturns = await prisma.returnBatch.findMany({
  where: {
  batchId: TARGET_BATCH_ID,
  createdAt: {
  gt: historicalWriteOff.createdAt,
  },
  },
  include: {
  OrderItem: {
  include: {
  order: true,
  product: true,
  },
  },
  },
  orderBy: {
  createdAt: "asc",
  },
  });

if (postWriteOffReturns.length === 0) {
throw new Error(
`No ReturnBatch records found for Batch #${TARGET_BATCH_ID} ` +
`after historical WRITE_OFF Movement #${historicalWriteOff.id}. ` +
`Current quantity cannot be safely attributed to post-write-off returns. ` +
`ABORTED.`
);
}

let totalReturnedAfterWriteOff = 0;

for (const returnBatch of postWriteOffReturns) {
totalReturnedAfterWriteOff += returnBatch.quantity;


console.log(
  `ReturnBatch #${returnBatch.id} | ` +
    `Order #${returnBatch.OrderItem.orderId} | ` +
    `OrderItem #${returnBatch.orderItemId} | ` +
    `quantity=${returnBatch.quantity} | ` +
    `createdAt=${returnBatch.createdAt.toISOString()}`
);


}

console.log("");

console.log(
`TOTAL RETURNED TO BATCH AFTER HISTORICAL WRITE_OFF=` +
`${totalReturnedAfterWriteOff}`
);

console.log(
`CURRENT BATCH QUANTITY=${targetBatch.quantity}`
);

console.log("");

/**

* For this targeted repair, the current 3 units must be exactly
* accounted for by the post-write-off returns.
*
* If more complex movement history appears, we stop rather than guess.
  */
  if (totalReturnedAfterWriteOff !== EXPECTED_CURRENT_QUANTITY) {
  throw new Error(
  `Post-write-off returns total=${totalReturnedAfterWriteOff}, ` +
  `but current Batch #${TARGET_BATCH_ID} quantity=` +
  `${EXPECTED_CURRENT_QUANTITY}. ` +
  `The current remainder cannot be proven safely. ABORTED.`
  );
  }

console.log(
"🟢 Post-write-off return history exactly explains current 3 units."
);
console.log("");

// ===========================================================================
// 7. SHOW EXPECTED REPAIR
// ===========================================================================

console.log("7. EXPECTED REPAIR");
console.log("------------------------------------------------------------------------------");

console.log(
`Batch #${TARGET_BATCH_ID}: ` +
`${targetBatch.quantity} → 0`
);

console.log(
`Batch #${TARGET_BATCH_ID}: ` +
`${targetBatch.status} → EXPIRED`
);

console.log(
`Product #${TARGET_PRODUCT_ID}: ` +
`stock will be recalculated from all batches`
);

console.log(
`Movement: WRITE_OFF -${EXPECTED_CURRENT_QUANTITY}`
);

console.log(
`Comment: ${NEW_WRITE_OFF_MARKER}`
);

console.log("");

// ===========================================================================
// 8. APPLY TRANSACTION
// ===========================================================================

console.log("8. APPLYING TRANSACTION");
console.log("------------------------------------------------------------------------------");

const result = await prisma.$transaction(async (tx) => {
// -------------------------------------------------------------------------
// A. RELOAD EVERYTHING INSIDE TRANSACTION
// -------------------------------------------------------------------------


const batch = await tx.batch.findUnique({
  where: {
    id: TARGET_BATCH_ID,
  },
  include: {
    product: true,
  },
});

if (!batch) {
  throw new Error(
    `Batch #${TARGET_BATCH_ID} disappeared before transaction. ABORTED.`
  );
}

if (batch.productId !== TARGET_PRODUCT_ID) {
  throw new Error(
    `Batch #${TARGET_BATCH_ID} product changed before transaction. ABORTED.`
  );
}

if (batch.quantity !== EXPECTED_CURRENT_QUANTITY) {
  throw new Error(
    `Batch #${TARGET_BATCH_ID} quantity changed before transaction: ` +
      `${batch.quantity} instead of ${EXPECTED_CURRENT_QUANTITY}. ABORTED.`
  );
}

if (batch.status !== "EXPIRED") {
  throw new Error(
    `Batch #${TARGET_BATCH_ID} status changed before transaction: ` +
      `${batch.status}. ABORTED.`
  );
}

if (batch.expiryDate >= new Date()) {
  throw new Error(
    `Batch #${TARGET_BATCH_ID} is no longer expired. ABORTED.`
  );
}

// -------------------------------------------------------------------------
// B. RECHECK DUPLICATE CURRENT WRITE-OFF INSIDE TRANSACTION
// -------------------------------------------------------------------------

const duplicateCurrentWriteOff = await tx.movement.findFirst({
  where: {
    productId: TARGET_PRODUCT_ID,
    type: "WRITE_OFF",
    quantity: {
      lt: 0,
    },
    comment: NEW_WRITE_OFF_MARKER,
  },
});

if (duplicateCurrentWriteOff) {
  throw new Error(
    `Current cleanup WRITE_OFF already exists as Movement #` +
      `${duplicateCurrentWriteOff.id}. ABORTED.`
  );
}

// -------------------------------------------------------------------------
// C. UPDATE BATCH
// -------------------------------------------------------------------------

const updatedBatch = await tx.batch.update({
  where: {
    id: TARGET_BATCH_ID,
  },
  data: {
    quantity: 0,
    status: "EXPIRED",
  },
});

// -------------------------------------------------------------------------
// D. RECALCULATE PRODUCT STOCK
// -------------------------------------------------------------------------

const productAggregate = await tx.batch.aggregate({
  where: {
    productId: TARGET_PRODUCT_ID,
  },
  _sum: {
    quantity: true,
  },
});

const newProductStock =
  productAggregate._sum.quantity ?? 0;

const updatedProduct = await tx.product.update({
  where: {
    id: TARGET_PRODUCT_ID,
  },
  data: {
    stock: newProductStock,
  },
});

// -------------------------------------------------------------------------
// E. CREATE NEW WRITE-OFF MOVEMENT
// -------------------------------------------------------------------------

const movement = await tx.movement.create({
  data: {
    type: "WRITE_OFF",
    quantity: -EXPECTED_CURRENT_QUANTITY,
    comment: NEW_WRITE_OFF_MARKER,
    productId: TARGET_PRODUCT_ID,
  },
});

// -------------------------------------------------------------------------
// F. VERIFY INSIDE TRANSACTION
// -------------------------------------------------------------------------

const verifyBatch = await tx.batch.findUnique({
  where: {
    id: TARGET_BATCH_ID,
  },
});

if (!verifyBatch) {
  throw new Error(
    `Batch #${TARGET_BATCH_ID} missing after update.`
  );
}

if (verifyBatch.quantity !== 0) {
  throw new Error(
    `Batch #${TARGET_BATCH_ID} verification failed: ` +
      `quantity=${verifyBatch.quantity}, expected 0.`
  );
}

if (verifyBatch.status !== "EXPIRED") {
  throw new Error(
    `Batch #${TARGET_BATCH_ID} verification failed: ` +
      `status=${verifyBatch.status}, expected EXPIRED.`
  );
}

const verifyProduct = await tx.product.findUnique({
  where: {
    id: TARGET_PRODUCT_ID,
  },
});

if (!verifyProduct) {
  throw new Error(
    `Product #${TARGET_PRODUCT_ID} missing after update.`
  );
}

const verifyBatchAggregate = await tx.batch.aggregate({
  where: {
    productId: TARGET_PRODUCT_ID,
  },
  _sum: {
    quantity: true,
  },
});

const verifyBatchTotal =
  verifyBatchAggregate._sum.quantity ?? 0;

if (verifyProduct.stock !== verifyBatchTotal) {
  throw new Error(
    `Product stock verification failed: ` +
      `Product.stock=${verifyProduct.stock}, ` +
      `SUM(Batch.quantity)=${verifyBatchTotal}.`
  );
}

if (verifyProduct.stock !== newProductStock) {
  throw new Error(
    `Product stock changed unexpectedly during verification.`
  );
}

return {
  batch: updatedBatch,
  product: updatedProduct,
  movement,
};


});

// ===========================================================================
// 9. FINAL RESULT
// ===========================================================================

console.log("");
console.log("🟢 TRANSACTION COMMITTED");
console.log("");

console.log(
`Batch #${result.batch.id}: quantity=${result.batch.quantity}`
);

console.log(
`Batch #${result.batch.id}: status=${result.batch.status}`
);

console.log(
`Product #${result.product.id} "${targetBatch.product.name}": ` +
`stock=${result.product.stock}`
);

console.log(
`Movement #${result.movement.id}: ` +
`type=${result.movement.type} | ` +
`quantity=${result.movement.quantity}`
);

console.log(
`Movement comment="${result.movement.comment}"`
);

console.log("");

// ===========================================================================
// 10. FINAL DATABASE VERIFICATION
// ===========================================================================

console.log("9. FINAL DATABASE VERIFICATION");
console.log("------------------------------------------------------------------------------");

const finalBatch = await prisma.batch.findUnique({
where: {
id: TARGET_BATCH_ID,
},
});

const finalProduct = await prisma.product.findUnique({
where: {
id: TARGET_PRODUCT_ID,
},
});

const finalAggregate = await prisma.batch.aggregate({
where: {
productId: TARGET_PRODUCT_ID,
},
_sum: {
quantity: true,
},
});

const finalBatchTotal =
finalAggregate._sum.quantity ?? 0;

const finalCurrentWriteOff = await prisma.movement.findFirst({
where: {
id: result.movement.id,
type: "WRITE_OFF",
quantity: -EXPECTED_CURRENT_QUANTITY,
productId: TARGET_PRODUCT_ID,
comment: NEW_WRITE_OFF_MARKER,
},
});

if (!finalBatch) {
throw new Error(
`FINAL CHECK FAILED: Batch #${TARGET_BATCH_ID} not found.`
);
}

if (!finalProduct) {
throw new Error(
`FINAL CHECK FAILED: Product #${TARGET_PRODUCT_ID} not found.`
);
}

if (finalBatch.quantity !== 0) {
throw new Error(
`FINAL CHECK FAILED: Batch #${TARGET_BATCH_ID} quantity=` +
`${finalBatch.quantity}, expected 0.`
);
}

if (finalBatch.status !== "EXPIRED") {
throw new Error(
`FINAL CHECK FAILED: Batch #${TARGET_BATCH_ID} status=` +
`${finalBatch.status}, expected EXPIRED.`
);
}

if (finalProduct.stock !== finalBatchTotal) {
throw new Error(
`FINAL CHECK FAILED: Product.stock=${finalProduct.stock}, ` +
`SUM(Batch.quantity)=${finalBatchTotal}.`
);
}

if (!finalCurrentWriteOff) {
throw new Error(
`FINAL CHECK FAILED: new WRITE_OFF movement not found.`
);
}

console.log(
`Batch #${TARGET_BATCH_ID} quantity=0`
);

console.log(
`Batch #${TARGET_BATCH_ID} status=EXPIRED`
);

console.log(
`Product #${TARGET_PRODUCT_ID} stock=${finalProduct.stock}`
);

console.log(
`SUM(Batch.quantity)=${finalBatchTotal}`
);

console.log(
`New WRITE_OFF Movement #${finalCurrentWriteOff.id} confirmed`
);

console.log("");

// ===========================================================================
// 11. FINAL SUCCESS MESSAGE
// ===========================================================================

console.log("==============================================================================");
console.log("WRITE-OFF COMPLETED SUCCESSFULLY");
console.log("==============================================================================");
console.log("");

console.log(
`Product #${TARGET_PRODUCT_ID} "${targetBatch.product.name}"`
);

console.log(
`Batch #${TARGET_BATCH_ID}`
);

console.log(
`Written off quantity=${EXPECTED_CURRENT_QUANTITY}`
);

console.log(
`Batch final quantity=0`
);

console.log(
`Batch final status=EXPIRED`
);

console.log(
`Product final stock=${finalProduct.stock}`
);

console.log(
`Movement #${finalCurrentWriteOff.id} = -${EXPECTED_CURRENT_QUANTITY}`
);

console.log("");

console.log(
"Historical Movement #127 was NOT modified."
);

console.log(
"Historical ReturnBatch records were NOT modified."
);

console.log(
"Order records were NOT modified."
);

console.log(
"OrderBatch records were NOT modified."
);

console.log("");

console.log("DATABASE WAS MODIFIED ONLY FOR THE CURRENT EXPIRED REMAINDER.");
console.log("");
}

main()
.catch((error) => {
console.error("");
console.error("🔴 WRITE-OFF FAILED");
console.error("");
console.error(error);
console.error("");
console.error("If this happened before the transaction, NO database changes were made.");
console.error("If the transaction threw an error, Prisma rolled back the transaction.");
console.error("");
process.exitCode = 1;
})
.finally(async () => {
await prisma.$disconnect();
});