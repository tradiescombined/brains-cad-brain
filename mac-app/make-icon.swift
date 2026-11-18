// Draws the 1024x1024 app icon: blue rounded square with "BCB" and a ruler line. Usage: swift make-icon.swift out.png
import Cocoa

let out = CommandLine.arguments[1]
let size: CGFloat = 1024
let img = NSImage(size: NSSize(width: size, height: size))
img.lockFocus()
let inset: CGFloat = 100
let rect = NSRect(x: inset, y: inset, width: size - 2 * inset, height: size - 2 * inset)
let path = NSBezierPath(roundedRect: rect, xRadius: 185, yRadius: 185)
NSGradient(starting: NSColor(calibratedRed: 0.13, green: 0.42, blue: 0.85, alpha: 1),
           ending: NSColor(calibratedRed: 0.06, green: 0.20, blue: 0.45, alpha: 1))!.draw(in: path, angle: -90)
let style = NSMutableParagraphStyle(); style.alignment = .center
let attrs: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 300, weight: .heavy),
    .foregroundColor: NSColor.white,
    .paragraphStyle: style,
]
NSString(string: "BCB").draw(in: NSRect(x: inset, y: 400, width: size - 2 * inset, height: 380), withAttributes: attrs)
// ruler
NSColor(calibratedRed: 1, green: 0.78, blue: 0.2, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 230, y: 270, width: 564, height: 70), xRadius: 12, yRadius: 12).fill()
NSColor(calibratedRed: 0.06, green: 0.20, blue: 0.45, alpha: 1).setFill()
for i in 0..<12 {
    let x = 260 + CGFloat(i) * 46
    NSRect(x: x, y: 300, width: 8, height: i % 3 == 0 ? 40 : 22).fill()
}
img.unlockFocus()
let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
