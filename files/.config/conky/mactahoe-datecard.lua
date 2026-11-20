require 'cairo'
require 'cairo_xlib'

-- ===== Tùy chỉnh nhanh =====
local FONT_DAY = 'Montserrat'     -- thứ, tháng, giờ
local FONT_SCRIPT = 'Allura'      -- chữ viết tay màu cam (đổi sang Sacramento, Great Vibes... tùy thích)
local SCALE = 1.25            -- hệ số phóng to cả thẻ (1.0 = gốc)
local WHITE = { 1, 1, 1 }
local ORANGE = { 0.95, 0.62, 0.15 }

local DAYS = { 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY' }
local MONTHS = { 'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY',
    'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER' }
local ORDINALS = { 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth',
    'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth',
    'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth', 'Twenty-first',
    'Twenty-second', 'Twenty-third', 'Twenty-fourth', 'Twenty-fifth', 'Twenty-sixth',
    'Twenty-seventh', 'Twenty-eighth', 'Twenty-ninth', 'Thirtieth', 'Thirty-first' }

-- ===== Công cụ vẽ =====
local function begin_draw()
    if conky_window == nil then return nil, nil end
    local surface = cairo_xlib_surface_create(conky_window.display, conky_window.drawable,
        conky_window.visual, conky_window.width, conky_window.height)
    local cr = cairo_create(surface)
    cairo_set_operator(cr, CAIRO_OPERATOR_SOURCE)
    cairo_set_source_rgba(cr, 0, 0, 0, 0)
    cairo_paint(cr)
    cairo_set_operator(cr, CAIRO_OPERATOR_OVER)
    return cr, surface
end

local function end_draw(cr, surface)
    if cr then cairo_destroy(cr) end
    if surface then cairo_surface_destroy(surface) end
end

local function font(cr, family, size, bold)
    cairo_select_font_face(cr, family, CAIRO_FONT_SLANT_NORMAL,
        bold and CAIRO_FONT_WEIGHT_BOLD or CAIRO_FONT_WEIGHT_NORMAL)
    cairo_set_font_size(cr, size)
end

-- Độ rộng thật của chuỗi (có dự phòng nếu bản Conky không có text_extents)
local function measure(cr, value, size)
    local ok, width = pcall(function()
        local extents = cairo_text_extents_t:create()
        tolua.takeownership(extents)
        cairo_text_extents(cr, value, extents)
        return extents.x_advance
    end)
    if ok and width then return width end
    return #value * size * 0.6
end

-- Vẽ chữ căn giữa tại cx, có thể giãn chữ (spacing px giữa các ký tự) và bóng nhẹ
local function put(cr, cx, y, value, size, color, spacing, alpha)
    spacing = spacing or 0
    local chars, widths, total = {}, {}, 0
    for ch in value:gmatch('[%z\1-\127\194-\244][\128-\191]*') do
        chars[#chars + 1] = ch
        widths[#widths + 1] = measure(cr, ch, size)
        total = total + widths[#widths]
    end
    total = total + spacing * math.max(#chars - 1, 0)
    for pass = 1, 2 do
        local x = cx - total / 2
        if pass == 1 then
            cairo_set_source_rgba(cr, 0, 0, 0, 0.30)
        else
            cairo_set_source_rgba(cr, color[1], color[2], color[3], alpha or 1)
        end
        for i, ch in ipairs(chars) do
            cairo_move_to(cr, x, pass == 1 and y + 1.5 or y)
            cairo_show_text(cr, ch)
            x = x + widths[i] + spacing
        end
    end
    return total
end

local function line(cr, x1, y1, x2, y2, alpha)
    cairo_set_source_rgba(cr, 1, 1, 1, alpha or 0.9)
    cairo_move_to(cr, x1, y1)
    cairo_line_to(cr, x2, y2)
    cairo_stroke(cr)
end

-- ===== Thẻ ngày giờ =====
function conky_datecard()
    local cr, surface = begin_draw()
    if cr == nil then return end

    local now = os.date('*t')
    local day_name = DAYS[now.wday]
    local month_name = MONTHS[now.month]
    local ordinal = ORDINALS[now.day]
    local hour12 = now.hour % 12
    if hour12 == 0 then hour12 = 12 end
    local clock = string.format('%02d:%02d %s', hour12, now.min, now.hour >= 12 and 'PM' or 'AM')

    local cx = conky_window.width / SCALE / 2
    cairo_scale(cr, SCALE, SCALE)
    cairo_set_line_width(cr, 2)
    cairo_set_line_cap(cr, CAIRO_LINE_CAP_BUTT)

    -- 1) Thứ: chữ thưa
    font(cr, FONT_DAY, 36, false)
    put(cr, cx, 106, day_name, 36, WHITE, 22)

    -- 2) Khung ngoặc vuông phía trên và dưới chữ (tâm tại giữa chữ)
    local half_w, top, bottom, arm = 47, 47, 135, 13
    cairo_set_source_rgba(cr, 1, 1, 1, 0.95)
    cairo_move_to(cr, cx - half_w, top + arm)
    cairo_line_to(cr, cx - half_w, top)
    cairo_line_to(cr, cx + half_w, top)
    cairo_line_to(cr, cx + half_w, top + arm)
    cairo_stroke(cr)
    cairo_move_to(cr, cx - half_w, bottom - arm)
    cairo_line_to(cr, cx - half_w, bottom)
    cairo_line_to(cr, cx + half_w, bottom)
    cairo_line_to(cr, cx + half_w, bottom - arm)
    cairo_stroke(cr)

    -- 3) Ngày bằng chữ viết tay màu cam
    font(cr, FONT_SCRIPT, 38, false)
    put(cr, cx, 182, ordinal, 38, ORANGE, 0)

    -- 4) Tháng
    font(cr, FONT_DAY, 22, true)
    put(cr, cx, 232, month_name, 22, WHITE, 0)

    -- 5) Giờ giữa hai đường kẻ
    font(cr, FONT_DAY, 14, false)
    local width = put(cr, cx, 268, clock, 14, WHITE, 2)
    cairo_set_line_width(cr, 1.2)
    local gap, length, ly = 14, 65, 263
    line(cr, cx - width / 2 - gap - length, ly, cx - width / 2 - gap, ly)
    line(cr, cx + width / 2 + gap, ly, cx + width / 2 + gap + length, ly)

    end_draw(cr, surface)
end
