// Renders the 1024x1024 macOS app icon from public/logo.svg, inset to Apple's icon grid (824px tile).
// Usage: swift make-icon.swift <logo.svg> <out.png>
import Cocoa

let svg = CommandLine.arguments[1], out = CommandLine.arguments[2]
guard let logo = NSImage(contentsOf: URL(fileURLWithPath: svg)) else { fatalError("could not load \(svg)") }
let size = 1024
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4,
                           hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSColor.clear.set()
NSRect(x: 0, y: 0, width: size, height: size).fill()
logo.draw(in: NSRect(x: 100, y: 100, width: 824, height: 824))
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
