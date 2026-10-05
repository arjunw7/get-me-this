# Playwright corpus verification — 5 October 2026

The original 60-URL corpus was exercised through the authenticated isolated Docker worker. After a structured-metadata fix, all 27 URLs from Nicobar, global Nicobar, The Whole Truth, IKEA and Flipkart were re-tested using the final reader. The other 33 results retain the stable 60-link run; Amazon code was unchanged and remaining sites rejected navigation/retailer access before field extraction. This is 60 unique URLs, 87 stable-run attempts, no Firecrawl requests or credits.

The earlier run without a process reaper exhausted its process limit and is excluded. Both stable containers reported zero zombie processes at completion. No stable-run browser/API/container errors occurred outside typed safe extraction failures. Docker limits: one vCPU, 1 GiB RAM, 256 PIDs, sandbox enabled, one admitted job, starts spaced at least 6.3 seconds. This is local source-IP evidence, not Railway evidence.

| Store | URLs | Title + image | Confirmed money |
| --- | ---: | ---: | ---: |
| ajio.com | 7 | 0 | 0 |
| amazon.in | 10 | 8 | 2 |
| etsy.com | 12 | 0 | 0 |
| flipkart.com | 4 | 4 | 0 |
| global.nicobar.com | 1 | 1 | 0 |
| ikea.com | 4 | 4 | 0 |
| myntra.com | 2 | 0 | 0 |
| nicobar.com | 10 | 10 | 0 |
| nykaa.com | 2 | 0 | 0 |
| thewholetruthfoods.com | 8 | 3 | 0 |
| **Total** | **60** | **30** | **2** |

All successful responses were revalidated through the compiled final Amazon or general-product proposal adapter before counting. Candidate image URLs were found; images were not downloaded/uploaded as part of this run. Missing money remains editable. Generic sources with variant/canonical ambiguity or malformed identities may fail despite HTTP 200. Nicobar’s duplicated JSON-LD URL is discarded; matching page title/image succeed without admitting its price.

The earlier separate Firecrawl replay found 33 usable title/image proposals. The historical union with these browser results is 47/60, supporting the chosen combination; that union is an opportunity estimate across separate runs, not a fresh end-to-end hybrid success rate.

See [normalized results](playwright-results.json). No raw page body, tokens, worker secret or provider credentials are included.
