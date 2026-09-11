import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const productId = 108;
  const supplyId = 112;
  const supplierId = 54;

  console.log("");
  console.log("============================================================");
  console.log("READ-ONLY V67 ORPHAN CHECK");
  console.log("Product #108 / Supply #112 / Supplier #54");
  console.log("============================================================");
  console.log("");

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      batches: true,
      supplyItems: {
        include: {
          supply: {
            include: {
              Supplier: true,
            },
          },
        },
      },
      orderItems: {
        include: {
          order: true,
          batches: {
            include: {
              batch: true,
            },
          },
          ReturnBatch: {
            include: {
              Batch: true,
            },
          },
        },
      },
      movements: true,
    },
  });

  console.log("PRODUCT #108");
  console.log(JSON.stringify(product, null, 2));

  const supply = await prisma.supply.findUnique({
    where: { id: supplyId },
    include: {
      Supplier: true,
      items: {
        include: {
          product: true,
        },
      },
    },
  });

  console.log("");
  console.log("SUPPLY #112");
  console.log(JSON.stringify(supply, null, 2));

  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    include: {
      Supply: {
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
        orderBy: {
          id: "asc",
        },
      },
    },
  });

  console.log("");
  console.log("SUPPLIER #54");
  console.log(JSON.stringify(supplier, null, 2));

  const relatedSupplyItems = await prisma.supplyItem.findMany({
    where: {
      OR: [
        { productId },
        { supplyId },
      ],
    },
    include: {
      product: true,
      supply: {
        include: {
          Supplier: true,
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  console.log("");
  console.log("ALL RELATED SUPPLY ITEMS");
  console.log(JSON.stringify(relatedSupplyItems, null, 2));

  const relatedBatches = await prisma.batch.findMany({
    where: {
      productId,
    },
    include: {
      product: true,
      orderBatches: {
        include: {
          orderItem: {
            include: {
              order: true,
            },
          },
        },
      },
      ReturnBatch: {
        include: {
          OrderItem: {
            include: {
              order: true,
            },
          },
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  console.log("");
  console.log("ALL BATCHES FOR PRODUCT #108");
  console.log(JSON.stringify(relatedBatches, null, 2));

  const relatedOrders = await prisma.orderItem.findMany({
    where: {
      productId,
    },
    include: {
      order: true,
      batches: {
        include: {
          batch: true,
        },
      },
      ReturnBatch: {
        include: {
          Batch: true,
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  console.log("");
  console.log("ALL ORDER ITEMS FOR PRODUCT #108");
  console.log(JSON.stringify(relatedOrders, null, 2));

  const relatedReturns = await prisma.returnBatch.findMany({
    where: {
      OR: [
        {
          Batch: {
            productId,
          },
        },
        {
          OrderItem: {
            productId,
          },
        },
      ],
    },
    include: {
      Batch: true,
      OrderItem: {
        include: {
          order: true,
          product: true,
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  console.log("");
  console.log("ALL RETURN BATCHES RELATED TO PRODUCT #108");
  console.log(JSON.stringify(relatedReturns, null, 2));

  const relatedMovements = await prisma.movement.findMany({
    where: {
      productId,
    },
    orderBy: {
      id: "asc",
    },
  });

  console.log("");
  console.log("ALL MOVEMENTS FOR PRODUCT #108");
  console.log(JSON.stringify(relatedMovements, null, 2));

  console.log("");
  console.log("============================================================");
  console.log("END OF READ-ONLY CHECK");
  console.log("DATABASE WAS NOT MODIFIED");
  console.log("============================================================");
  console.log("");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
