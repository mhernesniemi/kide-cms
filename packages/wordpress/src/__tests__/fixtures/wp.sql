-- MySQL dump 10.13  Distrib 8.0.33
--
-- Host: localhost    Database: wp
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
SET NAMES utf8mb4;

DROP TABLE IF EXISTS `wp_options`;
CREATE TABLE `wp_options` (
  `option_id` longtext,
  `option_name` longtext,
  `option_value` longtext,
  `autoload` longtext
) ENGINE=InnoDB;
LOCK TABLES `wp_options` WRITE;
INSERT INTO `wp_options` VALUES (1,'siteurl','https://example.com','yes'),(2,'home','https://example.com','yes'),(3,'blogname','Example','yes');
UNLOCK TABLES;
DROP TABLE IF EXISTS `wp_postmeta`;
CREATE TABLE `wp_postmeta` (
  `meta_id` longtext,
  `post_id` longtext,
  `meta_key` longtext,
  `meta_value` longtext
) ENGINE=InnoDB;
LOCK TABLES `wp_postmeta` WRITE;
INSERT INTO `wp_postmeta` VALUES (1,20,'_edit_lock','1683000000:1'),
(2,20,'_thumbnail_id','30'),
(3,20,'subtitle','A subtitle with several words'),
(4,20,'_subtitle','field_sub'),
(5,20,'facts','2'),
(6,20,'_facts','field_f'),
(7,20,'facts_0_label','Founded long ago'),
(8,20,'facts_0_value','1999'),
(9,20,'facts_1_label','People working here'),
(10,20,'facts_1_value','120'),
(11,20,'_yoast_wpseo_metadesc','SEO description words'),
(12,20,'related','a:1:{i:0;s:2:\"10\";}'),
(13,30,'_wp_attached_file','2023/05/team.jpg'),
(14,30,'_wp_attachment_image_alt','Team photo'),
(15,20,'legacy_flag','1');
UNLOCK TABLES;
DROP TABLE IF EXISTS `wp_posts`;
CREATE TABLE `wp_posts` (
  `ID` longtext,
  `post_author` longtext,
  `post_date` longtext,
  `post_date_gmt` longtext,
  `post_content` longtext,
  `post_title` longtext,
  `post_excerpt` longtext,
  `post_status` longtext,
  `post_name` longtext,
  `post_modified` longtext,
  `post_modified_gmt` longtext,
  `post_parent` longtext,
  `guid` longtext,
  `menu_order` longtext,
  `post_type` longtext,
  `post_mime_type` longtext
) ENGINE=InnoDB;
LOCK TABLES `wp_posts` WRITE;
INSERT INTO `wp_posts` VALUES (10,1,'2023-01-01 10:00:00','2023-01-01 08:00:00','<!-- wp:paragraph -->\n<p>About us in English with plenty of words.</p>\n<!-- /wp:paragraph -->','About us','','publish','about','2023-01-02 10:00:00','2023-01-02 08:00:00',0,'https://example.com/?page_id=10',0,'page',''),(11,1,'2023-01-03 10:00:00','2023-01-03 08:00:00','<!-- wp:paragraph -->\n<p>Tietoa meistä suomeksi monella sanalla.</p>\n<!-- /wp:paragraph -->','Meistä','','publish','meista','2023-01-03 10:00:00','2023-01-03 08:00:00',0,'https://example.com/?page_id=11',0,'page',''),(20,1,'2023-05-01 12:00:00','2023-05-01 09:00:00','<!-- wp:paragraph -->\n<p>Intro paragraph with <strong>bold words</strong> and a <a href=\"https://example.com/services/\">services link</a>.</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:heading {\"level\":3} -->\n<h3>Why it\'s different</h3>\n<!-- /wp:heading -->\n\n<!-- wp:acf/hero {\"name\": \"acf/hero\", \"data\": {\"heading\": \"Build better \\u00f6ppen services\", \"_heading\": \"field_h1\", \"items\": \"2\", \"_items\": \"field_it\", \"items_0_label\": \"Fast delivery for teams\", \"_items_0_label\": \"field_l\", \"items_1_label\": \"Calm operations at scale\", \"_items_1_label\": \"field_l\", \"bg_color\": \"#ff0000\", \"_bg_color\": \"field_bg\"}, \"mode\": \"preview\"} /-->\n\n<!-- wp:image {\"id\":30} -->\n<figure class=\"wp-block-image\"><img src=\"https://example.com/wp-content/uploads/2023/05/team-1024x683.jpg\" alt=\"Our team\"/></figure>\n<!-- /wp:image -->\n\n<!-- wp:spacer {\"height\":\"40px\"} -->\n<div style=\"height:40px\" class=\"wp-block-spacer\"></div>\n<!-- /wp:spacer -->\n\n<!-- wp:list -->\n<ul><!-- wp:list-item -->\n<li>First list point here</li>\n<!-- /wp:list-item --><!-- wp:list-item -->\n<li>Second list point here</li>\n<!-- /wp:list-item --></ul>\n<!-- /wp:list -->\n\n<!-- wp:block {\"ref\":40} /-->\n\n<!-- wp:paragraph -->\n<p>[caption id=\"x\"]Caption text for the photo[/caption] Read the <a href=\"https://example.com/wp-content/uploads/2023/05/brochure.pdf\">brochure pdf</a>.</p>\n<!-- /wp:paragraph -->','Hello \"world\"','Short excerpt text here','publish','hello-world','2023-05-02 12:00:00','2023-05-02 09:00:00',0,'https://example.com/?p=20',0,'post',''),(21,1,'2023-05-01 12:00:00','2023-05-01 09:00:00','old revision','Hello','','inherit','20-revision-v1','2023-05-01 12:00:00','2023-05-01 09:00:00',20,'',0,'revision',''),(22,1,'2023-06-01 12:00:00','2023-06-01 09:00:00','Classic first paragraph line.\n\nClassic second paragraph; it\'s here.','Classic draft','','draft','classic-draft','2023-06-01 12:00:00','2023-06-01 09:00:00',0,'',0,'post',''),(30,1,'2023-05-01 12:00:00','2023-05-01 09:00:00','','team','','inherit','team','2023-05-01 12:00:00','2023-05-01 09:00:00',20,'https://example.com/wp-content/uploads/2023/05/team.jpg',0,'attachment','image/jpeg'),(40,1,'2023-05-01 12:00:00','2023-05-01 09:00:00','<!-- wp:paragraph -->\n<p>Reusable call to action text.</p>\n<!-- /wp:paragraph -->','CTA','','publish','cta','2023-05-01 12:00:00','2023-05-01 09:00:00',0,'',0,'wp_block','');
UNLOCK TABLES;
DROP TABLE IF EXISTS `wp_term_relationships`;
CREATE TABLE `wp_term_relationships` (
  `object_id` longtext,
  `term_taxonomy_id` longtext,
  `term_order` longtext
) ENGINE=InnoDB;
LOCK TABLES `wp_term_relationships` WRITE;
INSERT INTO `wp_term_relationships` VALUES (10,1,0),(11,2,0),(10,3,0),(11,3,0),(20,1,0),(20,5,0),(22,1,0);
UNLOCK TABLES;
DROP TABLE IF EXISTS `wp_term_taxonomy`;
CREATE TABLE `wp_term_taxonomy` (
  `term_taxonomy_id` longtext,
  `term_id` longtext,
  `taxonomy` longtext,
  `description` longtext,
  `parent` longtext,
  `count` longtext
) ENGINE=InnoDB;
LOCK TABLES `wp_term_taxonomy` WRITE;
INSERT INTO `wp_term_taxonomy` VALUES (1,1,'language','',0,2),(2,2,'language','',0,1),(3,3,'post_translations','a:2:{s:2:\"en\";i:10;s:2:\"fi\";i:11;}',0,2),(5,5,'category','',0,1);
UNLOCK TABLES;
DROP TABLE IF EXISTS `wp_terms`;
CREATE TABLE `wp_terms` (
  `term_id` longtext,
  `name` longtext,
  `slug` longtext,
  `term_group` longtext
) ENGINE=InnoDB;
LOCK TABLES `wp_terms` WRITE;
INSERT INTO `wp_terms` VALUES (1,'English','en',0),(2,'Suomi','fi',0),(3,'pll_abc','pll_abc',0),(5,'News','news',0);
UNLOCK TABLES;
DROP TABLE IF EXISTS `wp_users`;
CREATE TABLE `wp_users` (
  `ID` longtext,
  `user_login` longtext
) ENGINE=InnoDB;
LOCK TABLES `wp_users` WRITE;
INSERT INTO `wp_users` VALUES (1,'admin');
UNLOCK TABLES;
DROP TABLE IF EXISTS `wp_yoast_indexable`;
CREATE TABLE `wp_yoast_indexable` (
  `id` int,
  `permalink` longtext,
  `object_id` int,
  `object_type` varchar(32)
) ENGINE=InnoDB;
INSERT INTO `wp_yoast_indexable` VALUES (1,'https://example.com/about/',10,'post'),(2,'https://example.com/fi/meista/',11,'post'),(3,'https://example.com/2023/05/hello-world/',20,'post'),(4,'https://example.com/category/news/',5,'term');
DROP TABLE IF EXISTS `wp_redirection_items`;
CREATE TABLE `wp_redirection_items` (
  `id` int,
  `url` longtext,
  `regex` int,
  `last_count` int,
  `status` varchar(20),
  `action_type` varchar(20),
  `action_code` int,
  `action_data` longtext
) ENGINE=InnoDB;
INSERT INTO `wp_redirection_items` VALUES (1,'/old-about/',0,3,'enabled','url',301,'https://example.com/about/');
