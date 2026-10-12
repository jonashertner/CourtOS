// CourtOS OCR helper for macOS: renders PDF pages with PDFKit and recognises
// text with the Vision framework, entirely on this computer.
// Usage: ocr-vision <file.pdf> <page>[,<page>...]
// Output: one JSON object per line: {"n":1,"text":"…","confidence":0.93}
import Foundation
import PDFKit
import Vision

let args = CommandLine.arguments
guard args.count >= 3, let document = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
    FileHandle.standardError.write("usage: ocr-vision file.pdf 1,2\n".data(using: .utf8)!)
    exit(2)
}
let pages = args[2].split(separator: ",").compactMap { Int($0) }

func render(_ page: PDFPage, scale: CGFloat) -> CGImage? {
    let bounds = page.bounds(for: .mediaBox)
    let width = Int(bounds.width * scale), height = Int(bounds.height * scale)
    guard width > 0, height > 0,
          let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
    else { return nil }
    context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    context.scaleBy(x: scale, y: scale)
    context.translateBy(x: -bounds.origin.x, y: -bounds.origin.y)
    page.draw(with: .mediaBox, to: context)
    return context.makeImage()
}

for number in pages {
    guard number >= 1, number <= document.pageCount, let page = document.page(at: number - 1), let image = render(page, scale: 2.5) else {
        print("{\"n\":\(number),\"text\":\"\",\"confidence\":0}")
        continue
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["de-DE", "fr-FR", "it-IT", "en-US"]
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    try? handler.perform([request])
    let observations = (request.results ?? []).sorted {
        abs($0.boundingBox.midY - $1.boundingBox.midY) > 0.006 ? $0.boundingBox.midY > $1.boundingBox.midY : $0.boundingBox.minX < $1.boundingBox.minX
    }
    var lines: [String] = []
    var confidence: Float = 0
    var previousBottom: CGFloat? = nil
    for observation in observations {
        guard let candidate = observation.topCandidates(1).first else { continue }
        // A larger vertical gap starts a new paragraph.
        if let bottom = previousBottom, bottom - observation.boundingBox.maxY > observation.boundingBox.height * 0.9 { lines.append("") }
        lines.append(candidate.string)
        confidence += candidate.confidence
        previousBottom = observation.boundingBox.minY
    }
    let average = observations.isEmpty ? 0 : confidence / Float(observations.count)
    let payload: [String: Any] = ["n": number, "text": lines.joined(separator: "\n"), "confidence": average]
    if let data = try? JSONSerialization.data(withJSONObject: payload), let line = String(data: data, encoding: .utf8) { print(line) }
}
