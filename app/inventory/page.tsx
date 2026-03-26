"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
    Pagination, Spinner, Button, Chip, Modal, ModalContent, ModalHeader, ModalBody,
    useDisclosure, Tabs, Tab
} from "@nextui-org/react";
import { Layers, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/PageHeader";

const ROWS_PER_PAGE = 10;

interface ProductVariant {
    id: number;
    size: string;
    stock: number;
    price: number;
}

interface Product {
    id: number;
    name: string;
    sku: string;
    status: string;
    product_variants: ProductVariant[];
}

// 1. Fetch function updated with the smart filter
const fetchInventory = async (page: number, filter: "All" | "Low Stock") => {
    const from = (page - 1) * ROWS_PER_PAGE;
    const to = from + ROWS_PER_PAGE - 1;

    // If "Low Stock" is selected, we use an !inner join to only return products 
    // that have at least one variant with less than 5 stock.
    const variantQuery = filter === "Low Stock" ? "product_variants!inner" : "product_variants";

    let query = supabase
        .from("products")
        .select(`id, name, sku, status, ${variantQuery}(id, size, stock, price)`, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

    if (filter === "Low Stock") {
        query = query.lt("product_variants.stock", 5);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { data: data as Product[], count: count ?? 0 };
};

export default function InventoryPage() {
    const [page, setPage] = useState(1);
    const [filter, setFilter] = useState<"All" | "Low Stock">("All");
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const { isOpen, onOpen, onOpenChange } = useDisclosure();

    const { data, isLoading } = useQuery({
        queryKey: ["inventory", page, filter], // Re-fetches automatically when filter changes
        queryFn: () => fetchInventory(page, filter),
    });

    const pages = data?.count ? Math.ceil(data.count / ROWS_PER_PAGE) : 0;

    const handleViewVariants = (product: Product) => {
        setSelectedProduct(product);
        onOpen();
    };

    return (
        <div className="flex flex-col h-full">
            <PageHeader title="Inventory Tracking" queryKey={["inventory"]} />

            {/* Smart Filter Toggle */}
            <div className="mb-6">
                <Tabs
                    aria-label="Inventory Filters"
                    selectedKey={filter}
                    onSelectionChange={(key) => {
                        setFilter(key as "All" | "Low Stock");
                        setPage(1); // Reset pagination on filter change
                    }}
                    color="danger"
                    variant="light"
                >
                    <Tab key="All" title="All Inventory" />
                    <Tab
                        key="Low Stock"
                        title={
                            <div className="flex items-center space-x-2">
                                <AlertTriangle size={16} />
                                <span>Low Stock Alerts</span>
                            </div>
                        }
                    />
                </Tabs>
            </div>

            <div className="flex-1 bg-content1 p-4 rounded-xl border border-divider">
                <Table
                    aria-label="Inventory table"
                    bottomContent={
                        pages > 0 ? (
                            <div className="flex w-full justify-center">
                                <Pagination isCompact showControls showShadow color="primary" page={page} total={pages} onChange={(page) => setPage(page)} />
                            </div>
                        ) : null
                    }
                >
                    <TableHeader>
                        <TableColumn>PRODUCT NAME</TableColumn>
                        <TableColumn>SKU</TableColumn>
                        <TableColumn>TOTAL STOCK</TableColumn>
                        <TableColumn>STATUS</TableColumn>
                        <TableColumn align="center">ACTIONS</TableColumn>
                    </TableHeader>
                    <TableBody
                        items={data?.data ?? []}
                        isLoading={isLoading}
                        loadingContent={<Spinner label="Loading inventory..." />}
                        emptyContent={!isLoading && (filter === "Low Stock" ? "Looking good! No low stock items." : "No products found.")}
                    >
                        {(product) => {
                            const totalStock = product.product_variants.reduce((acc, variant) => acc + (variant.stock || 0), 0);
                            // Visually flag the row if it was caught in the low stock filter
                            const hasLowStockVariant = product.product_variants.some(v => v.stock < 5);

                            return (
                                <TableRow key={product.id}>
                                    <TableCell className="font-medium">
                                        {product.name}
                                        {hasLowStockVariant && filter === "All" && (
                                            <Chip size="sm" color="danger" variant="dot" className="ml-2 border-none">Low</Chip>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-default-500">{product.sku}</TableCell>
                                    <TableCell>
                                        <span className={totalStock === 0 ? "text-danger font-bold" : (totalStock < 5 ? "text-warning font-semibold" : "")}>
                                            {totalStock}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <Chip size="sm" variant="flat" color={product.status === "Active" ? "success" : "default"}>
                                            {product.status}
                                        </Chip>
                                    </TableCell>
                                    <TableCell>
                                        <Button size="sm" variant="light" color="primary" startContent={<Layers size={14} />} onClick={() => handleViewVariants(product)}>
                                            View Variants
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        }}
                    </TableBody>
                </Table>
            </div>

            <Modal isOpen={isOpen} onOpenChange={onOpenChange} backdrop="blur">
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="flex flex-col gap-1">
                                {selectedProduct?.name}
                                <span className="text-sm font-normal text-default-500">SKU: {selectedProduct?.sku}</span>
                            </ModalHeader>
                            <ModalBody className="pb-6">
                                {selectedProduct?.product_variants && selectedProduct.product_variants.length > 0 ? (
                                    <div className="border border-divider rounded-lg overflow-hidden">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-default-100 text-default-600">
                                                <tr>
                                                    <th className="px-4 py-2 font-medium">Size / Variant</th>
                                                    <th className="px-4 py-2 font-medium">Stock Level</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-divider">
                                                {selectedProduct.product_variants.map((variant) => (
                                                    <tr key={variant.id} className={variant.stock < 5 ? "bg-danger/10" : ""}>
                                                        <td className="px-4 py-3">{variant.size || "Default"}</td>
                                                        <td className="px-4 py-3">
                                                            <Chip size="sm" color={variant.stock === 0 ? "danger" : (variant.stock < 5 ? "warning" : "success")} variant="dot" className="border-none">
                                                                {variant.stock} in stock
                                                            </Chip>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="text-center p-4 text-default-500 bg-default-100 rounded-lg">No variants found.</div>
                                )}
                            </ModalBody>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </div>
    );
}