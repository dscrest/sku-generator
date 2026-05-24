-- CreateTable
CREATE TABLE "Industry" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "skuSeparator" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Industry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "unit" TEXT,
    "valueType" TEXT NOT NULL,
    "skuPosition" INTEGER NOT NULL,
    "rangeMin" DOUBLE PRECISION,
    "rangeMax" DOUBLE PRECISION,
    "industryId" INTEGER NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyValue" (
    "id" SERIAL NOT NULL,
    "displayValue" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "description" TEXT,
    "propertyId" INTEGER NOT NULL,

    CONSTRAINT "PropertyValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SKUItem" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "industryId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SKUItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SKUItem_sku_key" ON "SKUItem"("sku");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Industry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyValue" ADD CONSTRAINT "PropertyValue_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SKUItem" ADD CONSTRAINT "SKUItem_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Industry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
