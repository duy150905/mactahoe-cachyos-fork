require 'cairo'
require 'cairo_xlib'

local WEATHER_STATE = os.getenv('HOME') .. '/.cache/mactahoe-widgets/weather.state'
local LUNAR_STATE = os.getenv('HOME') .. '/.cache/mactahoe-widgets/lunar.state'
local THERMAL = '/sys/class/thermal/thermal_zone0/temp'

local C = {
    white = { 1.00, 1.00, 1.00, 1.00 },
    sub = { 1.00, 1.00, 1.00, 0.75 },
}

local function clamp(value, low, high)
    if value < low then return low end
    if value > high then return high end
    return value
end

local function rounded_path(cr, x, y, w, h, r)
    r = math.min(r, w / 2, h / 2)
    cairo_new_sub_path(cr)
    cairo_arc(cr, x + w - r, y + r, r, -math.pi / 2, 0)
    cairo_arc(cr, x + w - r, y + h - r, r, 0, math.pi / 2)
    cairo_arc(cr, x + r, y + h - r, r, math.pi / 2, math.pi)
    cairo_arc(cr, x + r, y + r, r, math.pi, 3 * math.pi / 2)
    cairo_close_path(cr)
end

local function card(cr, x, y, w, h, r)
    cairo_set_source_rgba(cr, 0.0, 0.0, 0.0, 0.55)
    rounded_path(cr, x, y, w, h, r)
    cairo_fill(cr)

    cairo_set_line_width(cr, 1.0)
    cairo_set_source_rgba(cr, 1.0, 1.0, 1.0, 0.15)
    rounded_path(cr, x + 0.5, y + 0.5, w - 1.0, h - 1.0, r - 0.5)
    cairo_stroke(cr)
end

local function text_width(value, size, bold)
    local units = 0
    for char in value:gmatch('[%z\1-\127\194-\244][\128-\191]*') do
        if char == ' ' or char == '.' or char == ',' or char == ':' or char == '•' then
            units = units + 0.30
        else
            units = units + 0.56
        end
    end
    return units * size * (bold and 1.03 or 1.0)
end

local function text(cr, x, y, value, size, color, bold, align, family)
    if value == nil or value == '' then return end
    cairo_select_font_face(cr, family or 'SF Pro Text', CAIRO_FONT_SLANT_NORMAL,
        bold and CAIRO_FONT_WEIGHT_BOLD or CAIRO_FONT_WEIGHT_NORMAL)
    cairo_set_font_size(cr, size)

    if align == 'right' then
        x = x - text_width(value, size, bold)
    elseif align == 'center' then
        x = x - text_width(value, size, bold) / 2
    end

    cairo_set_source_rgba(cr, color[1], color[2], color[3], color[4] or 1)
    cairo_move_to(cr, x, y)
    cairo_show_text(cr, value)
end

local function image(cr, path, x, y, size)
    if path == nil or path == '' then return end
    local surface = cairo_image_surface_create_from_png(path)
    if cairo_surface_status(surface) ~= CAIRO_STATUS_SUCCESS then
        cairo_surface_destroy(surface)
        return
    end
    local width = cairo_image_surface_get_width(surface)
    local height = cairo_image_surface_get_height(surface)
    cairo_save(cr)
    cairo_translate(cr, x, y)
    cairo_scale(cr, size / width, size / height)

    cairo_set_source_rgba(cr, 0, 0, 0, 0.4)
    cairo_mask_surface(cr, surface, 3, 3)

    cairo_set_source_surface(cr, surface, 0, 0)
    cairo_paint(cr)
    cairo_restore(cr)
    cairo_surface_destroy(surface)
end

local function bar(cr, x, y, w, h, percent)
    percent = clamp(tonumber(percent) or 0, 0, 100)
    cairo_set_source_rgba(cr, 0, 0, 0, 0.2)
    rounded_path(cr, x, y, w, h, h / 2)
    cairo_fill(cr)
    if percent <= 0 then return end
    local fill_width = math.max(h, w * percent / 100)
    cairo_set_source_rgba(cr, 1, 1, 1, 0.95)
    rounded_path(cr, x, y, fill_width, h, h / 2)
    cairo_fill(cr)
end

local function clean(value)
    if value == nil then return '' end
    return (value:gsub('%s+', ' '):gsub('^%s+', ''):gsub('%s+$', ''))
end

local function conky_value(variable)
    return clean(conky_parse(variable))
end

local function number(value)
    return tonumber(value) or 0
end

local function celsius_from_thermal()
    local file = io.open(THERMAL, 'r')
    if not file then return nil end
    local raw = file:read('*l')
    file:close()
    local value = tonumber(raw)
    return value and math.floor(value / 1000 + 0.5) or nil
end

local function gpu_values()
    local raw = conky_value(
        '${execi 5 nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits}')
    local util, used, total, temp = raw:match('(%d+)%s*,%s*(%d+)%s*,%s*(%d+)%s*,%s*(%d+)')
    return { util = tonumber(util), used = tonumber(used), total = tonumber(total), temp = tonumber(temp) }
end

local function speed_text(value)
    local speed = tonumber(value) or 0
    if speed >= 1024 then return string.format('%.1f MB/s', speed / 1024) end
    return string.format('%.0f KB/s', speed)
end

local function read_state(path)
    local state = {}
    local file = io.open(path or WEATHER_STATE, 'r')
    if not file then return state end
    for line in file:lines() do
        local key, value = line:match('^([^=]+)=(.*)$')
        if key then state[key] = value end
    end
    file:close()
    return state
end

local function draw_weather(cr, width, height)
    card(cr, 10, 8, width - 20, height - 18, 26)
    local state = read_state()
    text(cr, 32, 41, state.city or 'Hà Nội', 16, C.white, true, 'left', 'SF Pro Display')
    text(cr, 32, 60, state.date or '', 13.0, C.sub, false, 'left')
    text(cr, 32, 119, (state.temp or '--') .. '°', 54, C.white, true, 'left', 'SF Pro Display')
    text(cr, 32, 142, state.condition or 'Đang tải…', 15.0, C.sub, true)
    text(cr, 32, 164, 'H:' .. (state.high or '--') .. '°    L:' .. (state.low or '--') .. '°', 14.0, C.sub, false)
    text(cr, 32, 184,
        'Cảm giác ' ..
        (state.feels or '--') ..
        '°   •   Độ ẩm ' .. (state.humidity or '--') .. '%   •   Gió ' .. (state.wind or '--') .. ' km/h', 12.0, C.sub,
        false)
    image(cr, state.icon, width - 132, 24, 96)
end

local function draw_system(cr, width, height)
    card(cr, 10, 8, width - 20, height - 18, 26)
    text(cr, 32, 41, 'Hệ thống', 16, C.white, true, 'left', 'SF Pro Display')
    text(cr, width - 32, 41, conky_value('${uptime}'), 12.0, C.sub, true, 'right')

    local cpu = number(conky_value('${cpu}'))
    local cpu_temp = celsius_from_thermal()
    local cpu_sub = 'Xeon E5-2680 v4' .. (cpu_temp and ('  •  ' .. cpu_temp .. '°C') or '')
    text(cr, 32, 69, 'CPU', 14.0, C.sub, true)
    text(cr, width - 32, 69, string.format('%.0f%%', cpu), 14.0, C.white, true, 'right')
    bar(cr, 32, 78, width - 64, 6, cpu)
    text(cr, 32, 96, cpu_sub, 12.0, C.sub, false)

    local gpu = gpu_values()
    local gpu_util = gpu.util or 0
    local gpu_value = string.format('%.0f%%', gpu_util) .. (gpu.temp and ('  •  ' .. gpu.temp .. '°C') or '')
    local gpu_sub = 'GTX 960' .. (gpu.used and string.format('  •  %d/%d MB', gpu.used, gpu.total) or '')
    text(cr, 32, 114, 'GPU', 14.0, C.sub, true)
    text(cr, width - 32, 114, gpu_value, 14.0, C.white, true, 'right')
    bar(cr, 32, 123, width - 64, 6, gpu_util)
    text(cr, 32, 141, gpu_sub, 12.0, C.sub, false)

    local mem_percent = number(conky_value('${memperc}'))
    text(cr, 32, 159, 'RAM', 14.0, C.sub, true)
    text(cr, width - 32, 159, string.format('%.0f%%', mem_percent), 14.0, C.white, true, 'right')
    bar(cr, 32, 168, width - 64, 6, mem_percent)
    text(cr, 32, 186,
        clean(conky_value('${mem}')) ..
        ' / ' ..
        clean(conky_value('${memmax}')) .. '  •  Swap ' .. string.format('%.0f%%', number(conky_value('${swapperc}'))),
        12.0, C.sub, false)

    local disk_percent = number(conky_value('${fs_used_perc /}'))
    text(cr, 32, 204, 'SSD', 14.0, C.sub, true)
    text(cr, width - 32, 204, string.format('%.0f%%', disk_percent), 14.0, C.white, true, 'right')
    bar(cr, 32, 213, width - 64, 6, disk_percent)
    text(cr, 32, 231, clean(conky_value('${fs_used /}')) .. ' / ' .. clean(conky_value('${fs_size /}')), 12.0, C.sub,
        false)

    cairo_set_source_rgba(cr, 1, 1, 1, 0.2)
    cairo_set_line_width(cr, 1)
    cairo_move_to(cr, 32, 245); cairo_line_to(cr, width - 32, 245); cairo_stroke(cr)

    local ip = conky_value('${addr enp6s0}')
    text(cr, 32, 264, 'Mạng', 14.0, C.sub, true)
    text(cr, width - 32, 264,
        '↓ ' ..
        speed_text(conky_value('${downspeedf enp6s0}')) .. '    ↑ ' .. speed_text(conky_value('${upspeedf enp6s0}')),
        13.0, C.white, true, 'right')
    text(cr, 32, 281, 'enp6s0' .. (ip ~= '' and ('  •  ' .. ip) or ''), 12.0, C.sub, false)
end

local function draw_lunar(cr, width, height)
    card(cr, 10, 8, width - 20, height - 18, 24)
    local state = read_state(LUNAR_STATE)

    text(cr, 32, 37, 'Âm lịch', 16, C.white, true, 'left', 'SF Pro Display')
    text(cr, width - 32, 37, 'Hôm nay', 12.0, C.sub, true, 'right')
    text(cr, 32, 95, state.lunar_day or '--', 46, C.white, true, 'left', 'SF Pro Display')

    local lunar_month_label = 'Tháng ' .. (state.lunar_month or '--') .. (state.lunar_leap == '1' and ' nhuận' or '')
    text(cr, 104, 67, lunar_month_label .. ' · ' .. (state.lunar_year_name or ''), 15.0, C.white, true, 'left',
        'SF Pro Display')
    text(cr, 104, 88, 'Âm lịch hôm nay', 13.0, C.sub, true)

    cairo_set_source_rgba(cr, 1, 1, 1, 0.2)
    cairo_set_line_width(cr, 1)
    cairo_move_to(cr, 32, 105); cairo_line_to(cr, width - 32, 105); cairo_stroke(cr)

    text(cr, 32, 126, 'Dương lịch', 12.5, C.sub, true)
    text(cr, 104, 126,
        string.format('%02d/%02d/%s', tonumber(state.solar_day) or 0, tonumber(state.solar_month) or 0,
            state.solar_year or '----') .. '  ·  ' .. (state.weekday or ''), 13.0, C.sub, false)
end

local function read_uptime_seconds()
    local file = io.open('/proc/uptime', 'r')
    if not file then return 0 end
    local raw = file:read('*l')
    file:close()
    return tonumber(raw and raw:match('^(%d+%.?%d*)')) or 0
end

local function clock_text(seconds)
    seconds = math.max(0, math.floor(seconds))
    return string.format('%02d:%02d', math.floor(seconds / 60), seconds % 60)
end

local function draw_rest(cr, width, height)
    card(cr, 10, 8, width - 20, height - 18, 24)
    local uptime = read_uptime_seconds()
    local cycle = math.floor(uptime) % 3300
    local on_break = cycle >= 3000

    local days, hours, minutes = math.floor(uptime / 86400), math.floor(uptime / 3600) % 24, math.floor(uptime / 60) % 60
    local uptime_label = days > 0 and string.format('%d ngày %dh', days, hours) or
        (hours > 0 and string.format('%dh %02dm', hours, minutes) or string.format('%d phút', minutes))

    text(cr, 32, 37, 'Nhắc nghỉ', 16, C.white, true, 'left', 'SF Pro Display')
    text(cr, 32, 72, uptime_label, 27, C.white, true, 'left', 'SF Pro Display')
    text(cr, 32, 93, 'Máy hoạt động', 12.0, C.sub, true)

    local progress, status, hint
    if on_break then
        progress = (cycle - 3000) / 300 * 100
        status = 'Nghỉ ngắn · còn ' .. clock_text(3300 - cycle)
        hint = 'Đi lại nhẹ nhàng, rời màn hình.'
    else
        progress = cycle / 3000 * 100
        status = 'Còn ' .. clock_text(3000 - cycle) .. ' đến giờ nghỉ'
        hint = cycle >= 2700 and 'Sắp đến lúc đứng dậy, vươn vai.' or 'Đổi tư thế, chớp mắt và nhìn xa.'
    end

    bar(cr, 32, 108, width - 64, 7, progress)
    text(cr, 32, 132, status, 13.0, C.white, true)
    text(cr, 32, 151, hint, 12.0, C.sub, false)
end

local function read_clock_theme()
    local path = os.getenv('HOME') .. '/.cache/mactahoe-widgets/clock_theme.txt'
    local file = io.open(path, 'r')
    if not file then return 'cyan' end
    local theme = file:read('*l')
    file:close()
    return theme and theme:gsub('%s+', '') or 'cyan'
end

local function draw_clock(cr)
    local hours = os.date('%H')
    local minutes = os.date('%M')
    local size = 220
    local x = 8
    local hours_width = text_width(hours, size, false)
    local colon_width = size * 0.30
    local text_y = 238

    cairo_select_font_face(cr, 'SF Pro Rounded', CAIRO_FONT_SLANT_NORMAL, CAIRO_FONT_WEIGHT_BOLD)
    cairo_set_font_size(cr, size)

    cairo_set_source_rgba(cr, 0, 0, 0, 0.6)
    cairo_move_to(cr, x + 6, text_y + 8)
    cairo_show_text(cr, hours)
    cairo_move_to(cr, x + hours_width + colon_width + 6, text_y + 8)
    cairo_show_text(cr, minutes)

    local theme = read_clock_theme()
    local glow_r, glow_g, glow_b = 0.2, 0.8, 1.0
    local top_r, top_g, top_b = 1.0, 1.0, 1.0
    local bot_r, bot_g, bot_b = 0.6, 0.9, 1.0

    if theme == 'purple' then
        glow_r, glow_g, glow_b = 0.8, 0.3, 1.0
        bot_r, bot_g, bot_b = 0.9, 0.6, 1.0
    elseif theme == 'emerald' then
        glow_r, glow_g, glow_b = 0.1, 0.9, 0.5
        bot_r, bot_g, bot_b = 0.5, 1.0, 0.7
    elseif theme == 'sunset' then
        glow_r, glow_g, glow_b = 1.0, 0.4, 0.2
        bot_r, bot_g, bot_b = 1.0, 0.8, 0.4
    elseif theme == 'white' then
        glow_r, glow_g, glow_b = 1.0, 1.0, 1.0
        bot_r, bot_g, bot_b = 0.8, 0.8, 0.8
    end

    for i = 1, 6 do
        cairo_set_source_rgba(cr, glow_r, glow_g, glow_b, 0.04)
        cairo_move_to(cr, x + i, text_y + i)
        cairo_show_text(cr, hours)
        cairo_move_to(cr, x - i, text_y - i)
        cairo_show_text(cr, hours)

        cairo_move_to(cr, x + hours_width + colon_width + i, text_y + i)
        cairo_show_text(cr, minutes)
        cairo_move_to(cr, x + hours_width + colon_width - i, text_y - i)
        cairo_show_text(cr, minutes)
    end

    local pat = cairo_pattern_create_linear(x, text_y - size * 0.8, x, text_y)
    cairo_pattern_add_color_stop_rgba(pat, 0.0, top_r, top_g, top_b, 1.0)
    cairo_pattern_add_color_stop_rgba(pat, 1.0, bot_r, bot_g, bot_b, 0.9)
    cairo_set_source(cr, pat)

    cairo_move_to(cr, x, text_y)
    cairo_show_text(cr, hours)
    cairo_move_to(cr, x + hours_width + colon_width, text_y)
    cairo_show_text(cr, minutes)
    cairo_pattern_destroy(pat)

    local colon_x = x + hours_width + colon_width / 2
    local seconds = tonumber(os.date('%S')) or 0
    local colon_alpha = seconds % 2 == 0 and 0.95 or 0.30

    cairo_set_source_rgba(cr, glow_r, glow_g, glow_b, colon_alpha)
    cairo_arc(cr, colon_x, text_y - 90, 10, 0, 2 * math.pi); cairo_fill(cr)
    cairo_arc(cr, colon_x, text_y - 40, 10, 0, 2 * math.pi); cairo_fill(cr)
end

local function begin_draw()
    if conky_window == nil then return nil, nil end
    local surface = cairo_xlib_surface_create(
        conky_window.display,
        conky_window.drawable,
        conky_window.visual,
        conky_window.width,
        conky_window.height
    )
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

function conky_weather()
    local cr, surface = begin_draw()
    if cr == nil then return end
    draw_weather(cr, conky_window.width, conky_window.height)
    end_draw(cr, surface)
end

function conky_system()
    local cr, surface = begin_draw()
    if cr == nil then return end
    draw_system(cr, conky_window.width, conky_window.height)
    end_draw(cr, surface)
end

function conky_lunar()
    local cr, surface = begin_draw()
    if cr == nil then return end
    draw_lunar(cr, conky_window.width, conky_window.height)
    end_draw(cr, surface)
end

function conky_rest()
    local cr, surface = begin_draw()
    if cr == nil then return end
    draw_rest(cr, conky_window.width, conky_window.height)
    end_draw(cr, surface)
end

function conky_clock()
    local cr, surface = begin_draw()
    if cr == nil then return end
    draw_clock(cr)
    end_draw(cr, surface)
end
