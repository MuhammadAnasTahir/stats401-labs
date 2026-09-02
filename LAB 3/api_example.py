import requests
from bs4 import BeautifulSoup

# Task 2.1 — Send a GET request
url = "https://example.com"
response = requests.get(url, timeout=10)

print(response)
print(response.status_code)

response.raise_for_status()
print("Request successful")

# Task 2.2 — Inspect the response
print(response.text)

# Task 2.3 — Add a User-Agent
headers = {
    "User-Agent": "STATS401-Class-Exercise/1.0"
}

response = requests.get(url, headers=headers, timeout=10)
print(response.status_code)


# Task 3 — Understand HTML structure
html = """
<div class="book">
    <h2 class="title">Data Visualization</h2>
    <p class="price">$35.00</p>
</div>

<div class="book">
    <h2 class="title">Learning Python</h2>
    <p class="price">$42.00</p>
</div>
"""

soup = BeautifulSoup(html, "html.parser")

books = []
for container in soup.find_all("div", class_="book"):
    title = container.find("h2", class_="title").text
    price = container.find("p", class_="price").text
    books.append({"title": title, "price": price})

print(books)
