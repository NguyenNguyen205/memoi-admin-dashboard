"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
    Pagination, Spinner, Chip, Input, DateRangePicker, Link,
    Modal, ModalContent, ModalHeader, ModalBody, useDisclosure, Button
} from "@nextui-org/react";
import { format } from "date-fns";
import { Search, ExternalLink, Eye, Package } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/PageHeader";

const ROWS_PER_PAGE = 10;

// 1. Updated Fetch: Added order_items to the select query
const fetchOrders = async (page: number, search: string, dateRange: any) => {
    const from = (page - 1) * ROWS_PER_PAGE;
    const to = from + ROWS_PER_PAGE - 1;

    let query = supabase
        .from("orders")
        .select(`
            id, order_number, total, currency, created_at, status, email, awb, awb_tracking_url, 
            users(tier_name),
            order_items(id, product_name, size, color, quantity, unit_price)
          `, { count: "exact" })
        .order("created_at", { ascending: false });

    if (search) {
        query = query.or(`order_number.ilike.%${search}%,email.ilike.%${search}%,awb.ilike.%${search}%`);
    }

    if (dateRange && dateRange.start && dateRange.end) {
        query = query.gte("created_at", dateRange.start.toString());
        query = query.lte("created_at", `${dateRange.end.toString()}T23:59:59.999Z`);
    }

    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { data, count: count ?? 0 };
};

const statusColorMap: Record<string, "success" | "warning" | "default" | "primary" | "danger"> = {
    COMPLETED: "success",
    IN_PROGRESS: "warning",
    PENDING: "default",
    CANCELLED: "danger",
};

export default function OrdersPage() {
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [dateRange, setDateRange] = useState<any>(null);

    // Modal State
    const { isOpen, onOpen, onOpenChange } = useDisclosure();
    const [selectedOrder, setSelectedOrder] = useState<any>(null);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 400);
        return () => clearTimeout(timer);
    }, [search]);

    const { data, isLoading, isError } = useQuery({
        queryKey: ["orders", page, debouncedSearch, dateRange],
        queryFn: () => fetchOrders(page, debouncedSearch, dateRange),
    });

    const pages = data?.count ? Math.ceil(data.count / ROWS_PER_PAGE) : 0;

    // Opens the modal and sets the active order data
    const handleViewOrder = (order: any) => {
        setSelectedOrder(order);
        onOpen();
    };

    return (
        <div className="flex flex-col h-full">
            <PageHeader title="Order Tracking" queryKey={["orders"]} />

            <div className="flex flex-col md:flex-row gap-4 mb-6">
                <Input
                    className="w-full md:w-[400px]"
                    placeholder="Search order #, email, or tracking (Mã vận đơn)..."
                    startContent={<Search size={18} className="text-default-400" />}
                    value={search}
                    onValueChange={setSearch}
                    isClearable
                    onClear={() => setSearch("")}
                />
                <DateRangePicker
                    className="w-full md:w-[300px]"
                    label="Filter by Date"
                    value={dateRange}
                    onChange={(val) => {
                        setDateRange(val);
                        setPage(1);
                    }}
                />
            </div>

            <div className="flex-1 bg-content1 p-4 rounded-xl border border-divider">
                {isError ? (
                    <div className="text-danger p-4">Failed to load orders.</div>
                ) : (
                    <Table
                        aria-label="Order tracking table"
                        bottomContent={
                            pages > 0 ? (
                                <div className="flex w-full justify-center">
                                    <Pagination isCompact showControls showShadow color="primary" page={page} total={pages} onChange={(page) => setPage(page)} />
                                </div>
                            ) : null
                        }
                    >
                        <TableHeader>
                            <TableColumn>ORDER NUMBER</TableColumn>
                            <TableColumn>CUSTOMER</TableColumn>
                            <TableColumn>DATE</TableColumn>
                            <TableColumn>TRACKING (AWB)</TableColumn>
                            <TableColumn>STATUS</TableColumn>
                            <TableColumn align="center">ACTIONS</TableColumn>
                        </TableHeader>
                        <TableBody
                            items={data?.data ?? []}
                            isLoading={isLoading}
                            loadingContent={<Spinner label="Loading orders..." />}
                            emptyContent={!isLoading && "No orders found matching your filters."}
                        >
                            {(order: any) => (
                                <TableRow key={order.id}>
                                    <TableCell className="font-medium">{order.order_number}</TableCell>

                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-sm">{order.email}</span>
                                            {order.users?.tier_name && order.users.tier_name !== 'Member' && (
                                                <Chip size="sm" variant="flat" color={order.users.tier_name === 'Gold' ? 'warning' : 'primary'} className="h-5 text-[10px]">
                                                    {order.users.tier_name}
                                                </Chip>
                                            )}
                                        </div>
                                    </TableCell>

                                    <TableCell className="text-default-500 whitespace-nowrap">
                                        {format(new Date(order.created_at), "MMM d, yyyy")}
                                    </TableCell>

                                    <TableCell>
                                        {order.awb && order.awb_tracking_url ? (
                                            <Link
                                                href={order.awb_tracking_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1 text-primary text-sm font-medium hover:underline"
                                            >
                                                {order.awb}
                                                <ExternalLink size={14} />
                                            </Link>
                                        ) : (
                                            <span className="text-default-400 text-sm italic">Pending</span>
                                        )}
                                    </TableCell>

                                    <TableCell>
                                        <Chip className="capitalize border-none gap-1 text-default-600" color={statusColorMap[order.status] || "default"} size="sm" variant="dot">
                                            {order.status.replace("_", " ")}
                                        </Chip>
                                    </TableCell>

                                    {/* 2. New Actions Column */}
                                    <TableCell>
                                        <Button
                                            size="sm"
                                            variant="light"
                                            color="primary"
                                            isIconOnly
                                            onClick={() => handleViewOrder(order)}
                                        >
                                            <Eye size={18} />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* 3. The Order Details Modal */}
            <Modal isOpen={isOpen} onOpenChange={onOpenChange} backdrop="blur" size="2xl">
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="flex flex-col gap-1">
                                Order Details
                                <span className="text-sm font-normal text-default-500">
                                    {selectedOrder?.order_number} • {selectedOrder?.email}
                                </span>
                            </ModalHeader>
                            <ModalBody className="pb-6">
                                {selectedOrder?.order_items && selectedOrder.order_items.length > 0 ? (
                                    <div className="border border-divider rounded-lg overflow-hidden">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-default-100 text-default-600">
                                                <tr>
                                                    <th className="px-4 py-3 font-medium">Item</th>
                                                    <th className="px-4 py-3 font-medium">Size</th>
                                                    <th className="px-4 py-3 font-medium text-center">Qty</th>
                                                    <th className="px-4 py-3 font-medium text-right">Price</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-divider">{selectedOrder.order_items.map((item: any) => (
                                                <tr key={item.id}>
                                                    <td className="px-4 py-3 font-medium">
                                                        <div className="flex items-center gap-2">
                                                            <Package size={16} className="text-default-400 shrink-0" />
                                                            <div className="flex flex-col">
                                                                <span>{item.product_name || "Unknown Product"}</span>
                                                                {item.color ? <span className="text-xs text-default-400">{item.color}</span> : null}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-default-500">{item.size || "N/A"}</td>
                                                    <td className="px-4 py-3 text-center">{item.quantity}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        ${Number(item.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </td>
                                                </tr>
                                            ))}</tbody>
                                        </table>                                        <div className="bg-default-50 px-4 py-3 text-right border-t border-divider flex justify-end gap-4">
                                            <span className="font-medium text-default-500">Order Total:</span>
                                            <span className="font-bold text-lg text-foreground">
                                                {Number(selectedOrder?.total).toLocaleString('en-US', { style: 'currency', currency: selectedOrder?.currency || 'SGD' })}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center p-8 text-default-500 bg-default-100 rounded-lg flex flex-col items-center gap-2">
                                        <Package size={32} className="text-default-300" />
                                        <p>No item details found for this order.</p>
                                    </div>
                                )}
                            </ModalBody>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </div>
    );
}