"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
    Pagination, Spinner, Chip, Input, DateRangePicker, Link,
    Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Button, Selection
} from "@nextui-org/react";
import { format } from "date-fns";
import { Search, ExternalLink, Eye, Package, Truck, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/PageHeader";
import { processBulkFulfillment, getFulfillmentPreview } from "@/actions/easyparcel";

// --- STRICT INTERFACES ---
interface OrderItem {
    id: string;
    product_name: string;
    size: string | null;
    color: string | null;
    quantity: number;
    unit_price: number;
}

interface Order {
    id: string;
    order_number: string;
    total: number;
    currency: string;
    created_at: string;
    status: string;
    email: string;
    awb: string | null;
    awb_tracking_url: string | null;
    users?: { tier_name: string } | null;
    order_items: OrderItem[];
}

const ROWS_PER_PAGE = 10;

// --- FETCH FUNCTION ---
const fetchOrders = async (page: number, search: string, dateRange: any): Promise<{ data: Order[], count: number }> => {
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

    return { data: data as unknown as Order[], count: count ?? 0 };
};

const statusColorMap: Record<string, "success" | "warning" | "default" | "primary" | "danger"> = {
    COMPLETED: "success",
    IN_PROGRESS: "warning",
    PENDING: "default",
    CANCELLED: "danger",
};

export default function OrdersPage() {
    const queryClient = useQueryClient();

    // Hydration Fix State
    const [isClient, setIsClient] = useState(false);

    // Table State
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [dateRange, setDateRange] = useState<any>(null);
    const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set([]));

    // Modals State
    const { isOpen: isDetailsOpen, onOpen: onDetailsOpen, onOpenChange: onDetailsChange } = useDisclosure();
    const { isOpen: isFulfillOpen, onOpen: onFulfillOpen, onOpenChange: onFulfillChange, onClose: onFulfillClose } = useDisclosure();
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

    // Fulfillment State
    const [weight, setWeight] = useState("1");
    const [debouncedWeight, setDebouncedWeight] = useState("1");
    const [isFulfilling, setIsFulfilling] = useState(false);
    const [fulfillResult, setFulfillResult] = useState<{ success: boolean; message: string } | null>(null);

    // Ensure hydration matches safely
    useEffect(() => {
        setIsClient(true);
    }, []);

    // Search Debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 400);
        return () => clearTimeout(timer);
    }, [search]);

    // Weight Debounce (for API Preview)
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedWeight(weight), 500);
        return () => clearTimeout(timer);
    }, [weight]);

    // 1. Fetch Orders Data
    const { data, isLoading, isError } = useQuery({
        queryKey: ["orders", page, debouncedSearch, dateRange],
        queryFn: () => fetchOrders(page, debouncedSearch, dateRange),
    });

    const pages = data?.count ? Math.ceil(data.count / ROWS_PER_PAGE) : 0;

    // Calculate total selected items safely
    const selectedCount = useMemo(() => {
        if (selectedKeys === "all") return data?.data?.length || 0;
        return selectedKeys.size;
    }, [selectedKeys, data]);

    // Extract selected IDs safely
    const getSelectedIds = () => {
        if (selectedKeys === "all") return (data?.data || []).map(o => o.id);
        return Array.from(selectedKeys as Set<string>);
    };

    // 2. Fetch Live EasyParcel Preview
    const { data: previewData, isLoading: isLoadingPreview } = useQuery({
        queryKey: ["fulfillmentPreview", getSelectedIds(), debouncedWeight],
        queryFn: async () => {
            const ids = getSelectedIds();
            if (ids.length === 0) return null;
            return await getFulfillmentPreview(ids, Number(debouncedWeight));
        },
        enabled: isFulfillOpen && selectedCount > 0,
    });

    const handleViewOrder = (order: Order) => {
        setSelectedOrder(order);
        onDetailsOpen();
    };

    const executeBulkFulfillment = async () => {
        setIsFulfilling(true);
        setFulfillResult(null);

        const ids = getSelectedIds();
        const result = await processBulkFulfillment(ids, Number(weight));

        setIsFulfilling(false);

        if (result.success) {
            setFulfillResult({ success: true, message: result.message || "Labels generated successfully!" });
            queryClient.invalidateQueries({ queryKey: ["orders"] });
            setSelectedKeys(new Set([]));

            setTimeout(() => {
                onFulfillClose();
                setFulfillResult(null);
            }, 2500);
        } else {
            setFulfillResult({ success: false, message: result.error || "Fulfillment failed." });
        }
    };

    return (
        <div className="flex flex-col h-full">
            <PageHeader title="Order Tracking" queryKey={["orders"]} />

            <div className="flex flex-col md:flex-row gap-4 mb-6 justify-between">
                <div className="flex flex-col md:flex-row gap-4 flex-1">
                    <Input
                        className="w-full md:w-[400px]"
                        placeholder="Search order #, email, or tracking..."
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

                {selectedCount > 0 && isClient && (
                    <Button
                        color="primary"
                        endContent={<Truck size={18} />}
                        onClick={() => {
                            setFulfillResult(null);
                            onFulfillOpen();
                        }}
                        className="shadow-lg shadow-primary/30 font-semibold"
                    >
                        Fulfill {selectedCount} Order{selectedCount > 1 ? 's' : ''}
                    </Button>
                )}
            </div>

            <div className="flex-1 bg-content1 p-4 rounded-xl border border-divider">
                {isError ? (
                    <div className="text-danger p-4">Failed to load orders.</div>
                ) : !isClient ? (
                    <div className="flex w-full justify-center items-center h-64">
                        <Spinner label="Loading table..." color="primary" />
                    </div>
                ) : (
                    <Table
                        aria-label="Order tracking table"
                        selectionMode="multiple"
                        selectedKeys={selectedKeys}
                        onSelectionChange={setSelectedKeys}
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
                            {(order: Order) => (
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

                                    <TableCell>
                                        <Button size="sm" variant="light" color="primary" isIconOnly onClick={() => handleViewOrder(order)}>
                                            <Eye size={18} />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* --- ORDER DETAILS MODAL --- */}
            <Modal isOpen={isDetailsOpen} onOpenChange={onDetailsChange} backdrop="blur" size="2xl">
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
                                            <tbody className="divide-y divide-divider">{selectedOrder.order_items.map((item: OrderItem) => (
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
                                        </table>
                                    </div>
                                ) : (
                                    <div className="text-center p-8 text-default-500 bg-default-100 rounded-lg">
                                        <Package size={32} className="mx-auto mb-2 text-default-300" />
                                        No item details found.
                                    </div>
                                )}
                            </ModalBody>
                        </>
                    )}
                </ModalContent>
            </Modal>

            {/* --- BULK FULFILLMENT MODAL --- */}
            <Modal isOpen={isFulfillOpen} onOpenChange={onFulfillChange} backdrop="blur">
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="flex flex-col gap-1">
                                Fulfill {selectedCount} Order{selectedCount > 1 ? 's' : ''}
                            </ModalHeader>
                            <ModalBody>
                                {!fulfillResult ? (
                                    <div className="flex flex-col gap-4">
                                        <p className="text-sm text-default-500">
                                            You are about to book shipping labels via EasyParcel. Please confirm the average weight to calculate the final cost.
                                        </p>

                                        <Input
                                            type="number"
                                            label="Average Package Weight (kg)"
                                            value={weight}
                                            onValueChange={setWeight}
                                            variant="bordered"
                                            min={0.1}
                                            step={0.1}
                                            endContent={<span className="text-default-400 text-sm">kg</span>}
                                        />

                                        {/* LIVE PRICING PREVIEW BOX */}
                                        <div className="bg-default-50 p-4 rounded-xl border border-divider flex flex-col gap-2 mt-2">
                                            <h4 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                                                <Truck size={16} className="text-primary" />
                                                EasyParcel Billing Summary
                                            </h4>

                                            {isLoadingPreview ? (
                                                <div className="py-4 flex justify-center"><Spinner size="sm" color="primary" label="Calculating live rates..." /></div>
                                            ) : previewData?.success ? (
                                                <>
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-default-500">Current Credit Balance</span>
                                                        <span className="font-medium text-foreground">${(previewData?.credit || 0).toFixed(2)}</span>
                                                    </div>
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-default-500">Estimated Label Cost ({selectedCount} items)</span>
                                                        <span className="font-medium text-danger">-${(previewData?.totalCost || 0).toFixed(2)}</span>
                                                    </div>
                                                    <div className="w-full h-px bg-divider my-1"></div>
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-default-500 font-medium">Remaining Balance</span>
                                                        <span className={`font-bold ${((previewData?.credit || 0) - (previewData?.totalCost || 0)) < 0 ? 'text-danger' : 'text-success'}`}>
                                                            ${((previewData?.credit || 0) - (previewData?.totalCost || 0)).toFixed(2)}
                                                        </span>
                                                    </div>

                                                    {((previewData?.credit || 0) - (previewData?.totalCost || 0)) < 0 && (
                                                        <div className="mt-2 text-xs text-danger flex items-center gap-1 bg-danger/10 p-2 rounded-lg">
                                                            <AlertCircle size={14} /> Insufficient credit. Please top up your account.
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="text-xs text-danger p-2 bg-danger/10 rounded-lg">
                                                    Failed to calculate shipping rates. Check customer zip codes.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className={`p-4 rounded-xl flex items-start gap-3 ${fulfillResult.success ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                                        {fulfillResult.success ? <CheckCircle2 className="shrink-0 mt-0.5" /> : <AlertCircle className="shrink-0 mt-0.5" />}
                                        <p className="font-medium text-sm leading-relaxed">{fulfillResult.message}</p>
                                    </div>
                                )}
                            </ModalBody>
                            <ModalFooter>
                                <Button color="default" variant="light" onPress={onClose} isDisabled={isFulfilling}>
                                    {fulfillResult?.success ? "Close" : "Cancel"}
                                </Button>
                                {!fulfillResult?.success && (
                                    <Button
                                        color="primary"
                                        onPress={executeBulkFulfillment}
                                        isLoading={isFulfilling || isLoadingPreview}
                                        isDisabled={!previewData?.success || ((previewData?.credit || 0) - (previewData?.totalCost || 0)) < 0}
                                        className="shadow-md shadow-primary/30"
                                    >
                                        Purchase Labels
                                    </Button>
                                )}
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>

        </div>
    );
}