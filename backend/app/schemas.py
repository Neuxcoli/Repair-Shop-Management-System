from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from .models import PriorityLevel, OrderStatus, TechnicianStatus, InvoiceStatus


# ---------- Customers ----------
class CustomerBase(BaseModel):
    full_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None


class CustomerCreate(CustomerBase):
    pass


class CustomerOut(CustomerBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


# ---------- Technicians ----------
class TechnicianBase(BaseModel):
    full_name: str
    email: str
    phone: Optional[str] = None
    specialty: str = "General"
    status: TechnicianStatus = TechnicianStatus.active


class TechnicianCreate(TechnicianBase):
    username: Optional[str] = None
    password: Optional[str] = None


class TechnicianOut(TechnicianBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    username: Optional[str] = None


# ---------- Items ----------
class ItemBase(BaseModel):
    customer_id: int
    description: str
    identifier: Optional[str] = None
    item_type: Optional[str] = None


class ItemCreate(ItemBase):
    pass


class ItemOut(ItemBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Parts ----------
class PartBase(BaseModel):
    sku: str
    name: str
    qty_on_hand: int = 0
    reorder_threshold: int = 5
    unit_cost: float = 0
    unit_price: float = 0


class PartCreate(PartBase):
    pass


class PartOut(PartBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Repair Orders ----------
class RepairOrderBase(BaseModel):
    customer_id: int
    item_id: int
    technician_id: Optional[int] = None
    problem_description: Optional[str] = None
    priority: PriorityLevel = PriorityLevel.normal
    status: OrderStatus = OrderStatus.requested


class RepairOrderCreate(RepairOrderBase):
    pass


class RepairOrderUpdate(BaseModel):
    technician_id: Optional[int] = None
    priority: Optional[PriorityLevel] = None
    status: Optional[OrderStatus] = None
    problem_description: Optional[str] = None
    inspection_notes: Optional[str] = None
    diagnosis: Optional[str] = None
    diagnosis_notes: Optional[str] = None
    estimated_cost: Optional[float] = None
    labor_cost: Optional[float] = None
    warranty_days: Optional[int] = None
    warranty_notes: Optional[str] = None


class RepairOrderPartCreate(BaseModel):
    part_id: int
    quantity: int = 1


class RepairOrderPartOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    quantity: int
    unit_price: float
    part: Optional[PartOut] = None


class RepairOrderOut(RepairOrderBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ro_number: str
    tracking_token: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    inspection_notes: Optional[str] = None
    diagnosis: Optional[str] = None
    diagnosis_notes: Optional[str] = None
    labor_cost: float = 0
    warranty_days: int = 0
    warranty_notes: Optional[str] = None
    released_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    estimated_cost: Optional[float] = None
    actual_cost: Optional[float] = None
    parts: list[RepairOrderPartOut] = Field(default_factory=list)
    parts_total: float = 0
    quote_total: float = 0
    customer: Optional[CustomerOut] = None
    item: Optional[ItemOut] = None
    technician: Optional[TechnicianOut] = None
    status_history: list[StatusHistoryOut] = Field(default_factory=list)


class StatusHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    from_status: Optional[str] = None
    to_status: Optional[str] = None
    changed_by: Optional[int] = None
    note: Optional[str] = None
    created_at: datetime


# ---------- Invoices ----------
class InvoiceBase(BaseModel):
    repair_order_id: int
    customer_id: int
    total: float
    amount_paid: float = 0
    status: InvoiceStatus = InvoiceStatus.unpaid


class InvoiceCreate(InvoiceBase):
    pass


class InvoiceOut(InvoiceBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    invoice_number: str
    issued_at: datetime
    paid_at: Optional[datetime] = None


# ---------- Payments ----------
class PaymentCreate(BaseModel):
    invoice_id: int
    amount: float
    method: str = "cash"
    reference: Optional[str] = None


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    invoice_id: int
    amount: float
    method: str
    reference: Optional[str] = None
    paid_at: datetime


# ---------- Invoice Update / Void ----------
class InvoiceUpdate(BaseModel):
    total: Optional[float] = None
    status: Optional[InvoiceStatus] = None


# ---------- Shop Settings ----------
class ShopSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    shop_name: str
    address: str
    phone: str
    email: str
    hours: str
    default_warranty_days: int
    currency_symbol: str
    overdue_urgent_hours: int
    overdue_high_hours: int
    overdue_normal_hours: int
    overdue_low_hours: int
    low_stock_threshold: int
    diagnostic_fee: float
    labor_rate: float
    updated_at: datetime


class ShopSettingsUpdate(BaseModel):
    shop_name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    hours: Optional[str] = None
    default_warranty_days: Optional[int] = None
    currency_symbol: Optional[str] = None
    overdue_urgent_hours: Optional[int] = None
    overdue_high_hours: Optional[int] = None
    overdue_normal_hours: Optional[int] = None
    overdue_low_hours: Optional[int] = None
    low_stock_threshold: Optional[int] = None
    diagnostic_fee: Optional[float] = None
    labor_rate: Optional[float] = None


# ---------- Technician Workload ----------
class TechnicianWorkloadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    email: str
    specialty: str
    status: str
    total_orders: int = 0
    open_orders: int = 0
    completed_orders: int = 0


# ---------- Customer Orders (drill-down) ----------
class CustomerOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ro_number: str
    status: str
    priority: str
    item_description: Optional[str] = None
    item_identifier: Optional[str] = None
    technician_name: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


# ---------- Customer portal (self-service) ----------
class PortalItemCreate(BaseModel):
    description: str
    identifier: Optional[str] = None
    item_type: Optional[str] = None


# ---------- Dashboard ----------
class DashboardSummary(BaseModel):
    open_orders: int
    avg_turnaround_days: float
    low_stock_parts: int
    revenue_this_month: float
    orders_by_status: dict


# ---------- Auth ----------
class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    full_name: str
    email: str
    phone: Optional[str] = None
    address: Optional[str] = None
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    role: str
    full_name: Optional[str] = None
    customer_id: Optional[int] = None
    technician_id: Optional[int] = None
    permissions: list[str] = Field(default_factory=list)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Public tracking (no auth) ----------
class TrackPartOut(BaseModel):
    name: str
    sku: Optional[str] = None
    quantity: int
    unit_price: float
    line_total: float


class TrackInvoiceOut(BaseModel):
    invoice_number: str
    total: float
    amount_paid: float
    balance: float
    status: str


class TrackOrderOut(BaseModel):
    ro_number: str
    status: str
    priority: str
    customer_name: str
    item_description: Optional[str] = None
    item_identifier: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    released_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    problem_description: Optional[str] = None
    inspection_notes: Optional[str] = None
    diagnosis: Optional[str] = None
    diagnosis_notes: Optional[str] = None
    estimated_cost: Optional[float] = None
    actual_cost: Optional[float] = None
    labor_cost: float
    parts_total: float
    quote_total: float
    warranty_days: int
    warranty_notes: Optional[str] = None
    parts: list[TrackPartOut] = Field(default_factory=list)
    invoice: Optional[TrackInvoiceOut] = None


# ---------- Additional-cost (quote approval) ----------
class AdditionalCostRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    repair_order_id: int
    amount: float
    reason: Optional[str] = None
    status: str
    created_at: datetime
    responded_at: Optional[datetime] = None


class AdditionalCostRequestCreate(BaseModel):
    amount: float
    reason: Optional[str] = None


class AdditionalCostRespond(BaseModel):
    status: str  # "approved" | "declined"


# ---------- Order photos ----------
class OrderPhotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    repair_order_id: int
    object_key: str
    caption: Optional[str] = None
    created_at: datetime
    url: Optional[str] = None


# ---------- Customer portal invoices ----------
class PortalInvoiceOut(BaseModel):
    id: int
    invoice_number: str
    repair_order_id: int
    total: float
    amount_paid: float
    balance: float
    status: str
    issued_at: datetime
    paid_at: Optional[datetime] = None
    ro_number: Optional[str] = None
    order_date: Optional[datetime] = None


class PortalInvoiceLineOut(BaseModel):
    description: str
    quantity: float
    unit_price: float
    line_total: float


class PortalInvoiceDetailOut(PortalInvoiceOut):
    line_items: list[PortalInvoiceLineOut] = Field(default_factory=list)
    order_item_description: Optional[str] = None


class PortalOrderCreate(BaseModel):
    type: str = "existing"  # "existing" | "new"
    item_id: Optional[int] = None
    item_description: Optional[str] = None
    item_identifier: Optional[str] = None
    problem_description: Optional[str] = None


class PortalOrderListOut(BaseModel):
    id: int
    ro_number: str
    status: str
    priority: str
    tracking_token: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    item_description: Optional[str] = None
    item_identifier: Optional[str] = None


class PortalOrderDetailOut(BaseModel):
    id: int
    ro_number: str
    status: str
    priority: str
    tracking_token: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    item_description: Optional[str] = None
    item_identifier: Optional[str] = None
    problem_description: Optional[str] = None
    diagnosis: Optional[str] = None
    warranty_days: int = 0
    warranty_notes: Optional[str] = None
    labor_cost: float = 0
    parts_total: float = 0
    quote_total: float = 0
    parts: list[PortalLineOut] = Field(default_factory=list)
    status_history: list[StatusHistoryOut] = Field(default_factory=list)
    photos: list[OrderPhotoOut] = Field(default_factory=list)


class PortalLineOut(BaseModel):
    name: str
    quantity: int
    unit_price: float
    line_total: float
