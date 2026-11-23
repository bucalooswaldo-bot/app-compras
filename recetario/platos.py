# Lista de platos del recetario del producto (fase 3): el índice de las 1000 recetas que hay que escribir.
# Solo nombres de platos (la idea de un plato no tiene dueño). Cada receta se escribe desde cero.
# Uso: python3 recetario/platos.py  -> cuenta, avisa de repetidos y escribe recetario/platos.json

import json, os, unicodedata

PLATOS = {
  'Legumbres y cuchara': """
Lentejas con verduras; Lentejas con chorizo; Lentejas estofadas con arroz; Lentejas con calabaza; Lentejas al curry;
Lentejas rojas con zanahoria; Ensalada templada de lentejas; Garbanzos con espinacas; Garbanzos con bacalao; Cocido madrileño;
Potaje de vigilia; Garbanzos estofados con costilla; Garbanzos con langostinos; Garbanzos salteados con chorizo; Hummus casero;
Fabada asturiana; Alubias blancas con almejas; Alubias rojas con arroz; Alubias pintas con chorizo; Judiones de la Granja;
Pochas con almejas; Alubias con verduras; Fabes con almejas; Potaje de garbanzos y acelgas; Olla gitana;
Caldo gallego; Puchero andaluz; Escudella; Potaje de lentejas con calabaza; Garbanzos con pollo;
Garbanzos al curry con coco; Potaje de alubias y calabaza; Lentejas con pollo; Garbanzos con champiñones; Alubias blancas estofadas;
Ensalada de garbanzos; Ensalada de alubias blancas; Lentejas con arroz integral; Guiso de garbanzos con huevo; Alubias con codorniz;
Cocido montañés; Pote asturiano; Potaje de garbanzos con bacalao y espinacas; Lentejas a la riojana; Garbanzos fritos con jamón;
Falafel al horno; Hamburguesas de lentejas; Albóndigas de garbanzos; Chili de alubias; Alubias con oreja;
Guiso de soja texturizada; Garbanzos tostados con especias; Crema de lentejas; Lentejas con setas; Garbanzos con tomate y huevo;
Alubias verdes con jamón; Potaje de habichuelas; Michirones; Fabes con bacalao; Cocido maragato;
Gazpacho manchego; Patatas a la riojana; Patatas con costillas; Patatas guisadas con sepia; Marmitako;
Patatas con bacalao; Patatas con carne; Patatas a la importancia; Guiso de patatas con calamares; Patatas con chorizo y huevo;
Caldereta de patatas y conejo; Ajoarriero; Patatas en salsa verde; Patatas viudas; Guiso de patatas con pollo;
Arroz caldoso con alubias y nabos; Garbanzos con calabaza y pimentón; Lentejas viudas; Alubias rojas con calabaza; Potaje de espinacas y garbanzos;
Lentejas con verduras al horno; Garbanzos con calamares; Fabada vegetal; Ensalada de lentejas y atún; Alubias con perdiz
""",
  'Sopas y cremas': """
Sopa de fideos; Sopa de pollo con fideos; Sopa de cocido; Sopa de ajo castellana; Sopa de picadillo;
Caldo de pollo casero; Caldo de verduras casero; Consomé al jerez; Sopa de pescado; Sopa de marisco;
Sopa de tomate; Sopa minestrone; Sopa de cebolla gratinada; Sopa juliana; Sopa de letras para niños;
Crema de calabacín; Crema de calabaza; Crema de zanahoria y jengibre; Crema de puerros; Vichyssoise;
Crema de champiñones; Crema de espárragos; Crema de brócoli; Crema de coliflor; Crema de guisantes con menta;
Crema de espinacas; Crema de verduras; Crema de tomate asado; Crema de pimientos rojos; Crema de alcachofas;
Crema de boniato; Crema de berenjena asada; Crema de garbanzos; Crema de marisco; Crema de pollo;
Crema de castañas; Crema de apio y manzana; Crema de remolacha; Crema de setas; Salmorejo;
Gazpacho andaluz; Ajoblanco; Gazpacho de sandía; Gazpacho de remolacha; Porra antequerana;
Sopa de miso con tofu; Sopa de verduras con pasta; Sopa de arroz; Sopa de calabaza y coco; Sopa castellana con huevo;
Sopa de lentejas rojas; Caldo de huesos; Sopa de pescado y fideos; Crema de calabacín y queso; Crema fría de pepino y yogur;
Crema de lombarda; Crema de puerro y patata; Sopa de tortilla; Sopa de cebolla y queso; Sopa de pollo y verduras
""",
  'Arroces': """
Paella valenciana; Paella de marisco; Paella mixta; Arroz negro; Arroz a banda;
Arroz con pollo; Arroz con costillas; Arroz al horno; Arroz con verduras; Arroz con bogavante;
Arroz caldoso de marisco; Arroz caldoso de pollo; Arroz meloso de setas; Arroz con conejo; Arroz del senyoret;
Arroz tres delicias; Arroz frito con huevo y verduras; Arroz con calamares; Arroz con alcachofas;
Arroz con bacalao; Arroz con atún; Arroz con salchichas; Arroz con champiñones; Arroz blanco con tomate;
Risotto de setas; Risotto de calabaza; Risotto de espárragos; Risotto de gambas; Risotto de queso;
Arroz con pollo al curry; Arroz con costra; Arroz con sepia y alcachofa; Arroz con verduras al horno; Arroz con lentejas;
Arroz caldoso de verduras; Arroz con conejo y caracoles; Arroz con pato; Arroz con chorizo; Arroz con mejillones;
Arroz meloso de carrillera; Arroz con pulpo; Arroz con secreto ibérico; Arroz con huevo frito; Ensalada de arroz;
Arroz con calabaza y garbanzos; Arroz con boletus; Fideuá; Fideuá negra; Arroz integral salteado con verduras;
Arroz pilaf; Arroz con pimientos y bacalao; Arroz con almejas; Arroz con pollo y verduras al horno; Arroz con salmón;
Arroz basmati con pollo especiado; Arroz meloso de gambas; Arroz con coliflor; Arroz con rape; Arroz con habas
""",
  'Pasta': """
Macarrones con carne y tomate; Macarrones con chorizo; Macarrones gratinados; Espaguetis a la boloñesa; Espaguetis carbonara;
Espaguetis con tomate y albahaca; Espaguetis aglio e olio; Espaguetis con almejas; Espaguetis con gambas y ajo; Espaguetis al pesto;
Lasaña de carne; Lasaña de verduras; Lasaña de atún; Lasaña de espinacas y ricotta; Canelones de carne;
Canelones de atún; Canelones de espinacas; Tallarines con setas; Tallarines al pesto con pollo; Tallarines con salmón y nata;
Pasta con atún y tomate; Pasta con brócoli; Pasta con calabacín y gambas; Pasta con verduras salteadas; Pasta cuatro quesos;
Pasta con pollo y champiñones; Pasta a la puttanesca; Pasta arrabbiata; Pasta con espinacas y queso; Pasta con salsa de calabaza;
Ensalada de pasta; Ensalada de pasta con atún; Pasta con lentejas; Pasta con garbanzos; Pasta con chorizo y pimiento;
Ñoquis con tomate; Ñoquis con salsa de queso; Ñoquis con mantequilla y salvia; Fideos a la cazuela; Fideos con costillas;
Tortellini con nata y jamón; Raviolis con salsa de tomate; Pasta con salchichas; Pasta con atún y aceitunas; Macarrones con queso;
Pasta con pesto rojo; Pasta con calabacín y limón; Pasta con berenjena; Pasta con bacon y guisantes; Pasta con pimientos asados;
Espaguetis con albóndigas; Pasta con pollo al curry; Pasta con setas y jamón; Pasta con salmón ahumado; Pasta con sardinas;
Espaguetis con calamares; Pasta con carne picada y verduras; Pasta al horno con bechamel; Pasta con alcachofas; Pasta con brócoli y anchoas;
Fideos chinos con verduras; Fideos de arroz con pollo; Tallarines con gambas y verduras; Pasta con queso y pimienta; Pasta fresca con tomate crudo;
Pasta integral con verduras; Lasaña de pollo; Canelones de pollo; Macarrones con tomate y atún; Pasta con ricotta y limón
""",
  'Pollo y pavo': """
Pollo al horno con papas; Pollo al ajillo; Pollo en pepitoria; Pollo a la cerveza; Pollo al limón;
Pollo con tomate; Pollo guisado con patatas; Pollo al chilindrón; Pollo al curry; Pollo con champiñones;
Pollo a la naranja; Pollo con almendras; Pollo en salsa de cebolla; Pollo al vino blanco; Pollo con pimientos;
Pollo asado entero; Muslos de pollo al horno; Alitas de pollo al horno; Alitas con miel y soja; Pechugas a la plancha;
Pechugas rellenas de jamón y queso; Pechugas empanadas; Filetes de pollo a la milanesa; Nuggets caseros; Fingers de pollo al horno;
Pollo teriyaki; Pollo con verduras salteadas; Pollo al estragón; Pollo a la mostaza; Pollo con salsa de yogur;
Pollo tikka masala; Pollo con cacahuete; Brochetas de pollo; Fajitas de pollo; Burritos de pollo;
Pollo al pimentón; Pollo al romero; Pollo con ciruelas; Pollo en salsa de almendras; Pollo agridulce;
Pollo con arroz y verduras al horno; Pollo con calabaza; Pollo con aceitunas; Pollo con salsa de queso; Pollo al horno con limón y hierbas;
Pollo en papillote; Pollo al chocolate; Pollo con setas y nata; Pollo a la cazadora; Pollo con alcachofas;
Pollo con salsa barbacoa; Albóndigas de pollo; Hamburguesas de pollo; Croquetas de pollo; Pollo desmenuzado para bocadillos;
Ensalada de pollo; Pollo al horno con boniato; Pollo con garbanzos y especias; Pollo frito crujiente; Pollo al pil pil;
Pavo al horno; Pavo guisado con verduras; Filetes de pavo con salsa de champiñones; Pavo al curry; Albóndigas de pavo;
Rollitos de pavo con espárragos; Pavo a la plancha con salsa de yogur; Pavo con pimientos; Hamburguesas de pavo; Pavo salteado con verduras
""",
  'Cerdo': """
Lomo a la plancha; Lomo al horno; Lomo con pimientos; Lomo adobado; Lomo con salsa de queso;
Lomo con leche; Lomo relleno; Solomillo de cerdo a la mostaza; Solomillo al whisky; Solomillo con salsa de setas;
Solomillo con salsa de Pedro Ximénez; Costillas al horno; Costillas a la barbacoa; Costillas con miel; Costillas guisadas con patatas;
Chuletas de cerdo a la plancha; Chuletas con salsa de manzana; Secreto ibérico a la plancha; Presa ibérica; Carrillera de cerdo al vino tinto;
Codillo al horno; Magro con tomate; Cerdo agridulce; Cerdo al ajillo; Cinta de lomo con champiñones;
Filetes de cerdo empanados; San Jacobos caseros; Flamenquines; Carne de cerdo con pimentón; Estofado de cerdo;
Cerdo con ciruelas; Albóndigas en salsa; Albóndigas con tomate; Salchichas al vino blanco; Salchichas con tomate;
Pinchos morunos; Lomo con castañas; Cerdo con verduras al wok; Pulled pork; Cachopo;
Cerdo con piña; Carne de cerdo guisada con patatas; Panceta al horno; Chorizo a la sidra; Morcilla con manzana
""",
  'Ternera y otras carnes': """
Filetes de ternera a la plancha; Filetes de ternera empanados; Filetes en salsa; Ternera guisada con patatas; Estofado de ternera;
Ternera en salsa de cebolla; Ternera al vino tinto; Ternera con champiñones; Ternera con pimientos; Ternera a la jardinera;
Redondo de ternera en salsa; Carne mechada; Rabo de toro; Carrilleras de ternera; Ossobuco;
Hamburguesas caseras; Albóndigas de ternera; Pastel de carne; Rollo de carne picada; Carne picada con tomate;
Chili con carne; Ternera salteada con verduras; Ternera al curry; Tacos de ternera; Entrecot a la plancha;
Solomillo de ternera; Ropa vieja; Pimientos rellenos de carne; Calabacines rellenos de carne; Berenjenas rellenas de carne;
Picadillo de carne; Ternera a la cerveza; Ternera con salsa de almendras; Goulash; Lengua en salsa;
Cordero asado; Caldereta de cordero; Chuletas de cordero a la plancha; Paletilla de cordero al horno; Cordero al chilindrón;
Conejo al ajillo; Conejo guisado; Ternasco asado; Conejo con tomate; Codornices estofadas
""",
  'Pescados': """
Merluza a la romana; Merluza en salsa verde; Merluza al horno; Merluza a la gallega; Merluza con almejas;
Merluza en papillote; Rape a la marinera; Rape al horno; Bacalao a la vizcaína; Bacalao al pil pil;
Bacalao con tomate; Bacalao al horno con patatas; Bacalao dorado; Buñuelos de bacalao; Croquetas de bacalao;
Salmón al horno; Salmón a la plancha; Salmón en papillote; Salmón con salsa de eneldo; Salmón teriyaki;
Lubina a la sal; Lubina al horno; Dorada al horno; Dorada a la espalda; Sardinas a la plancha;
Sardinas al horno; Boquerones fritos; Boquerones en vinagre; Caballa al horno; Caballa en escabeche;
Atún encebollado; Atún con tomate; Atún a la plancha; Bonito con tomate; Emperador a la plancha;
Pez espada en salsa; Gallo empanado; Lenguado a la meunière; Rodaballo al horno; Besugo al horno;
Cherne en salsa; Sama al horno; Vieja sancochada; Merluza a la koskera; Dorada a la sal;
Pescado al horno con verduras; Albóndigas de pescado; Hamburguesas de salmón; Pastel de pescado; Pastel de cabracho;
Calamares a la romana; Calamares en su tinta; Calamares encebollados; Sepia a la plancha; Sepia con guisantes;
Pulpo a la gallega; Pulpo a la plancha; Chipirones a la plancha; Chipirones en su tinta; Choco con patatas;
Rosada al horno; Panga con verduras; Abadejo con pisto; Truchas a la navarra; Fletán al horno;
Merluza con pimientos; Salmón con verduras al horno; Bacalao con garbanzos; Pescado en salsa de tomate; Ventresca con pimientos
""",
  'Marisco': """
Gambas al ajillo; Gambas a la plancha; Langostinos cocidos; Langostinos al ajillo; Mejillones al vapor;
Mejillones a la marinera; Mejillones en escabeche caseros; Mejillones tigre; Almejas a la marinera; Almejas al ajillo;
Berberechos al vapor; Navajas a la plancha; Zamburiñas a la plancha; Vieiras gratinadas; Salpicón de marisco;
Cóctel de gambas; Brochetas de langostinos; Gambas con gabardina; Revuelto de gambas y ajetes; Tortillitas de camarones;
Cazuela de marisco; Zarzuela de pescado y marisco; Langostinos con salsa rosa; Gambas al pil pil; Cangrejos en salsa
""",
  'Huevos': """
Tortilla de papas; Tortilla de patatas con cebolla; Tortilla francesa; Tortilla de espinacas; Tortilla de atún;
Tortilla de calabacín; Tortilla de champiñones; Tortilla de queso; Tortilla de jamón; Tortilla paisana;
Tortilla de verduras; Tortilla de bacalao; Tortilla de berenjena; Tortilla de chorizo; Tortilla de pimientos;
Huevos rotos con jamón; Huevos estrellados con chorizo; Huevos a la flamenca; Huevos rellenos; Huevos rellenos de atún;
Huevos en salsa; Huevos al plato; Huevos escalfados; Huevos revueltos con champiñones; Revuelto de espárragos trigueros;
Revuelto de setas; Revuelto de espinacas y gambas; Huevos con pisto; Huevos con tomate; Shakshuka;
Huevos fritos con patatas; Huevos poché con espinacas; Frittata de verduras; Huevos a la cazuela; Huevos con bechamel;
Revuelto de morcilla; Tortilla de patatas sin huevo; Tortilla de calabaza; Revuelto de bacalao; Huevos duros con mayonesa
""",
  'Verduras y guarniciones': """
Pisto manchego; Ratatouille; Escalivada; Menestra de verduras; Verduras al horno;
Verduras a la plancha; Verduras salteadas; Wok de verduras; Judías verdes con patatas; Judías verdes con tomate;
Judías verdes salteadas con jamón; Coliflor gratinada; Coliflor rebozada; Coliflor al ajoarriero; Brócoli al vapor con ajo;
Brócoli gratinado; Espinacas a la crema; Espinacas con garbanzos; Espinacas salteadas con pasas y piñones; Acelgas rehogadas;
Acelgas con patatas; Alcachofas con jamón; Alcachofas al horno; Alcachofas rebozadas; Espárragos trigueros a la plancha;
Berenjenas rellenas de verduras; Berenjenas fritas con miel; Berenjenas a la parmesana; Calabacín relleno de atún; Calabacín gratinado;
Calabacín a la plancha; Champiñones al ajillo; Setas salteadas; Pimientos asados; Borraja con patatas;
Pimientos rellenos de arroz; Pimientos de piquillo rellenos de bacalao; Tomates rellenos; Tomates asados; Puerros gratinados;
Cebolla caramelizada; Zanahorias glaseadas; Calabaza asada; Boniato asado; Patatas asadas;
Patatas panaderas; Patatas bravas; Patatas fritas caseras; Patatas al horno con romero; Puré de patatas;
Patatas gratinadas; Patatas rellenas; Patatas a lo pobre; Patatas con alioli; Patatas cocidas con mojo;
Lombarda con manzana; Repollo rehogado; Coles de Bruselas al horno; Guisantes con jamón; Habas con jamón;
Hamburguesas de verduras; Croquetas de verduras; Buñuelos de calabacín; Tempura de verduras; Pastel de verduras;
Quiche de verduras; Flan de verduras; Pudin de calabacín; Calabacín relleno de verduras y queso; Champiñones rellenos
""",
  'Ensaladas': """
Ensalada mixta; Ensalada de tomate; Ensalada de tomate y ventresca; Ensalada campera; Ensaladilla rusa;
Ensalada César; Ensalada caprese; Ensalada griega; Ensalada de pollo y aguacate; Ensalada de atún y huevo;
Ensalada de patata; Ensalada de pasta fresca; Ensalada de arroz con atún; Ensalada de quinoa; Ensalada de cuscús;
Ensalada de lentejas con verduras; Ensalada de garbanzos y pimiento; Ensalada de judías verdes; Ensalada de espinacas y fresas; Ensalada de rúcula y queso de cabra;
Ensalada de canónigos; Ensalada de aguacate y tomate; Ensalada de pepino y yogur; Ensalada de zanahoria; Ensalada de col;
Ensalada de remolacha; Ensalada de naranja y bacalao; Remojón granadino; Pipirrana; Ensalada murciana;
Esqueixada; Xató; Ensalada de pimientos asados; Ensalada de salmón ahumado; Ensalada de marisco;
Ensalada de pollo al curry; Ensalada de frutas y queso fresco; Ensalada de manzana y nueces; Ensalada tibia de setas; Ensalada de mango y gambas;
Ensalada de tomate y queso fresco; Ensalada de pasta con pesto; Ensalada de arroz y verduras; Ensalada de alubias rojas; Ensalada de lechuga y cebolla;
Ensalada de berenjena asada; Ensalada de patata y huevo; Ensalada de brócoli; Ensalada de calabacín crudo; Ensalada de tomate y aguacate con mango
""",
  'Cenas rápidas y bocadillos': """
Sándwich mixto; Sándwich de pollo; Sándwich vegetal; Club sándwich; Bocadillo de tortilla;
Bocadillo de calamares; Bocadillo de lomo con queso; Pepito de ternera; Serranito; Montadito de pringá;
Bikini de jamón y queso; Tostas de tomate y jamón; Tostas de aguacate; Tostas de salmón; Tostas de champiñones;
Wrap de pollo; Wrap vegetal; Quesadillas; Tacos de pollo; Nachos con queso;
Perritos calientes caseros; Hamburguesa completa; Pita de pollo; Pita de falafel; Kebab casero;
Pizza margarita casera; Pizza de jamón y champiñones; Pizza barbacoa; Pizza de verduras; Pizza de atún;
Pan pizza; Cena de tortilla y ensalada; Croquetas de jamón; Empanadillas de atún; Empanadillas de carne;
Sopa rápida de verduras; Huevos revueltos con pan; Salteado de pollo y verduras; Fajitas de verduras; Pasta rápida con tomate;
Tosta de queso de cabra y cebolla; Molletes con tomate; Sándwich de atún; Bocadillo de pechuga; Hamburguesa vegetal;
Crepes salados de jamón y queso; Revuelto de calabacín; Montaditos variados; Sándwich de salmón y queso crema; Tostas de pisto
""",
  'Horno, masas y empanadas': """
Empanada gallega de atún; Empanada de carne; Empanada de pollo; Empanada de bacalao y pasas; Empanada de verduras;
Quiche lorraine; Quiche de espinacas; Quiche de puerros; Quiche de salmón; Hojaldre de espinacas y queso;
Lasaña de berenjena; Musaka; Pastel de patata y carne; Gratinado de patata y jamón; Canelones de verduras;
Flamenquines al horno; Croquetas de pollo y jamón; Croquetas de queso; Croquetas de setas; Croquetas de cocido;
Pan de pita casero; Pan casero; Pan de molde casero; Focaccia; Masa de pizza casera;
Coca de recapte; Coca de trempó; Hornazo; Torta de aceite salada; Calzone
""",
  'Cocina canaria': """
Potaje de berros; Potaje de verduras canario; Puchero canario; Rancho canario; Sancocho canario;
Papas arrugadas con mojo; Mojo rojo; Mojo verde; Mojo de cilantro; Gofio escaldado;
Pella de gofio; Carne de cochino frita; Carne fiesta; Conejo en salmorejo canario; Garbanzas compuestas;
Ropa vieja canaria; Escaldón de gofio; Caldo de papas; Caldo de millo; Potaje de lentejas canario;
Potaje de jaramagos; Pescado salado con papas; Cherne a la canaria; Vieja guisada; Sama con papas;
Chicharros fritos; Lapas con mojo; Pulpo en mojo; Atún en adobo canario; Tollos en salsa;
Queso asado con mojo; Bienmesabe; Frangollo; Quesillo; Truchas de batata;
Rapaduras; Leche asada; Bizcochón canario; Polvito uruguayo; Arepas
""",
  'Cocina de otras regiones': """
Cocido lebaniego; Porrusalda; Bacalao al ajoarriero; Txangurro; Pimientos de piquillo rellenos de carne;
Migas extremeñas; Migas de pastor; Gachas manchegas; Duelos y quebrantos; Morteruelo;
Pollo al chilindrón aragonés; Ternasco al horno; Trucha a la navarra; Callos a la madrileña; Soldaditos de Pavía;
Pescaíto frito; Cazón en adobo; Rabo de toro cordobés; Flamenquín cordobés; Espinacas con garbanzos sevillanas;
Caldereta extremeña; Caldero murciano; Michirones murcianos; Zarangollo; Pastel de carne murciano;
Fritura malagueña; Empedrat; Fricandó; Suquet de peix; Caparrones;
Tumbet mallorquín; Sobrasada con miel; Frit mallorquí; Pulpo con cachelos; Lacón con grelos;
Zorza con patatas; Caldereta de langosta; Fabada con almejas; Cachopo asturiano; Sopa castellana;
Cochinillo asado; Lechazo asado; Judiones con chorizo; Patatas revolconas; Pisto con huevo;
Ajo blanco malagueño; Gazpachuelo; Porra con huevo y jamón; Papas a lo pobre andaluzas; Pipirrana jaenera
""",
  'Tapas y entrantes': """
Croquetas de jamón ibérico; Calamares fritos; Patatas con salsa brava y alioli; Champiñones a la plancha; Pimientos de padrón fritos;
Gildas; Banderillas; Ensaladilla con gambas; Boquerones con ajo y perejil; Pinchos de tortilla;
Chorizo al vino; Morcilla frita; Queso frito; Berenjenas con miel de caña; Croquetas de espinacas;
Huevos rotos con pimientos; Tabla de quesos; Pan con tomate y jamón; Aceitunas aliñadas; Patatas aliñadas;
Mejillones rellenos; Pulpo a feira; Sepia con alioli; Montaditos de lomo; Rollitos de jamón y queso;
Montaditos de anchoa; Tostas de sardina; Dátiles con bacon; Pinchos de pollo; Tosta de escalivada;
Paté casero de higaditos; Paté de atún; Paté de aceitunas; Guacamole; Salsa de yogur con pepino;
Crema de berenjena; Champiñones rellenos de jamón; Huevos de codorniz con jamón; Mini hamburguesas; Brochetas caprese;
Rollitos de primavera caseros; Empanadillas de pisto; Buñuelos de queso; Palitos de queso; Tostadas de hummus;
Ensaladilla de pulpo; Salpicón de pulpo; Hojaldritos de salchicha; Volovanes de marisco; Tartaletas de atún
""",
  'Desayunos y meriendas': """
Tostadas con tomate y aceite; Tostadas con aguacate y huevo; Porridge de avena; Avena con frutas; Yogur con granola casera;
Granola casera; Tortitas americanas; Tortitas de avena y plátano; Crepes dulces; Gofres caseros;
Batido de plátano; Batido de fresa; Batido verde; Zumo de naranja con zanahoria; Smoothie de frutos rojos;
Bizcocho de yogur; Bizcocho de naranja; Magdalenas caseras; Muffins de arándanos; Pan de plátano;
Galletas de mantequilla; Galletas de avena; Bocadillo de chocolate; Tostadas francesas; Churros caseros;
Rosquillas; Pestiños; Huevos revueltos con tostada; Sándwich de pavo y queso; Fruta con yogur y miel;
Barritas de cereales caseras; Bolitas de dátiles y avena; Chocolate a la taza; Leche con gofio; Café con leche y tostada de mantequilla;
Pudin de chía; Tostada de queso fresco y mermelada; Bizcocho de zanahoria; Muffins salados de jamón y queso; Bollos de leche
""",
  'Postres y dulces': """
Flan de huevo; Flan de queso; Natillas; Arroz con leche; Crema catalana;
Torrijas; Leche frita; Tarta de queso al horno; Tarta de queso sin horno; Tarta de manzana;
Tarta de Santiago; Tarta de la abuela; Tarta de chocolate; Brownie; Bizcocho de chocolate;
Mousse de chocolate; Mousse de limón; Mousse de fresa; Tiramisú; Panna cotta;
Natillas de chocolate; Cuajada con miel; Yogur casero; Peras al vino; Manzanas asadas;
Macedonia de frutas; Fresas con nata; Sorbete de limón; Helado de vainilla casero; Helado de plátano;
Polos de fruta caseros; Coulant de chocolate; Profiteroles; Bizcocho de limón; Rosquillas de anís;
Galletas de chocolate; Trufas de chocolate; Turrón casero de chocolate; Mazapanes; Polvorones;
Roscón de Reyes; Buñuelos de viento; Tarta de galletas; Tarta tres chocolates; Tarta de zanahoria;
Pudin de pan; Tocino de cielo; Tejas de almendra; Bizcocho de calabaza; Compota de manzana;
Crema pastelera; Hojaldre de crema; Palmeras de hojaldre; Tarta de limón y merengue; Bizcocho de plátano y chocolate;
Galletas de jengibre; Crepes con chocolate; Gelatina de frutas; Semifrío de turrón; Tarta helada;
Pastel de plátano canario; Quesada pasiega; Sobaos caseros; Carquiñoles; Ensaimada casera;
Filloas; Frixuelos; Casadielles; Leche merengada; Arroz con leche de coco
""",
  'Salsas y bases': """
Salsa de tomate casera; Sofrito básico; Bechamel; Mayonesa casera; Alioli;
Salsa rosa; Salsa vinagreta; Pesto de albahaca; Salsa de queso; Salsa de setas;
Salsa barbacoa casera; Salsa de yogur; Salsa verde de perejil; Romesco; Salsa de pimienta;
Salsa española; Caldo de pescado casero; Salsa de mostaza y miel; Tomate frito casero; Mojo picón
""",
}

def normal(t):
  return ''.join(c for c in unicodedata.normalize('NFD', t.lower()) if unicodedata.category(c) != 'Mn').strip()

if __name__ == '__main__':
  salida, vistos, repes = [], {}, []
  for cat, texto in PLATOS.items():
    for n in [x.strip() for x in texto.replace('\n', ' ').split(';') if x.strip()]:
      k = normal(n)
      if k in vistos: repes.append((n, cat, vistos[k])); continue
      vistos[k] = cat
      salida.append({'nombre': n, 'tipo': cat})
  por = {}
  for p in salida: por[p['tipo']] = por.get(p['tipo'], 0) + 1
  for c, n in por.items(): print(f'{n:4} {c}')
  print(f'{len(salida):4} TOTAL')
  for r in repes: print('repetido:', r)
  with open(os.path.join(os.path.dirname(__file__), 'platos.json'), 'w') as f:
    json.dump(salida, f, ensure_ascii=False, indent=1)
